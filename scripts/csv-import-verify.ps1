# Verifies the upgraded question CSV import path end-to-end: MATCHING type, media, and
# code->id resolution for knowledge/exam mappings + tags (the exact calls the import page makes).
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
$pass = 0; $fail = 0
function Ok($m)  { Write-Host "PASS: $m" -ForegroundColor Green; $script:pass++ }
function Bad($m) { Write-Host "FAIL: $m" -ForegroundColor Red;   $script:fail++ }
function Login($e,$p){ (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).accessToken }
function Hdr($t){ @{ Authorization = "Bearer $t" } }
function Post($t,$path,$body){ Invoke-RestMethod -Uri "$base$path" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10) }
function Put($t,$path,$body){ Invoke-RestMethod -Uri "$base$path" -Method Put -Headers (Hdr $t) -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10) }
function Get1($t,$path){ Invoke-RestMethod -Uri "$base$path" -Headers (Hdr $t) }

$ts = Get-Random
Write-Host "=== CSV import verify (run $ts) ===" -ForegroundColor Cyan
$su = Login 'admin@pharmacy-mcq.local' 'ChangeMe_Admin1'

# Seed a knowledge node + exam profile with known codes (what the CSV would reference).
$kcode = "CSVK-$ts"; $ecode = "CSVE-$ts"
$kn = Post $su '/knowledge/nodes' @{ code = $kcode; name = "CSV Knowledge $ts"; type = 'CONCEPT' }
$ex = Post $su '/exams' @{ code = $ecode; name = "CSV Exam $ts"; status = 'DRAFT' }
Ok "seeded knowledge code=$kcode and exam code=$ecode"

# Resolve by code exactly like the import page does.
$kHit = (Get1 $su "/knowledge/nodes?search=$kcode").items | Where-Object { $_.code -eq $kcode } | Select-Object -First 1
$eHit = (Get1 $su '/exams?pageSize=100').items | Where-Object { $_.code -eq $ecode } | Select-Object -First 1
if ($kHit -and $eHit) { Ok "resolved knowledge+exam codes -> ids" } else { Bad "code resolution failed" }

# 1) MATCHING question (new via CSV)
$mq = Post $su '/questions' @{
  questionCode = "CSV-MATCH-$ts"; questionType = 'MATCHING'; authorDifficulty = 'MEDIUM'; language = 'en';
  questionText = 'Match each drug to its class.';
  answerSpec = @{ type = 'MATCHING'; pairs = @(
    @{ left = 'Atenolol'; right = 'Beta blocker' },
    @{ left = 'Omeprazole'; right = 'PPI' }
  ) }
}
$mqv = $mq.workingVersion; if (-not $mqv) { $mqv = $mq.currentVersion }
if ($mq.questionType -eq 'MATCHING' -and $mqv.answerSpec.pairs.Count -eq 2) { Ok "MATCHING created with 2 pairs" } else { Bad "MATCHING create wrong (pairs=$($mqv.answerSpec.pairs.Count))" }

# 2) SINGLE_CHOICE with media + knowledge/exam/tags mappings (the full import row)
$sq = Post $su '/questions' @{
  questionCode = "CSV-SC-$ts"; questionType = 'SINGLE_CHOICE'; authorDifficulty = 'EASY'; language = 'en';
  questionText = 'Which is a beta blocker?';
  media = @(@{ mediaType = 'IMAGE'; url = 'https://example.com/img.png'; altText = 'diagram'; displayOrder = 0 });
  answerSpec = @{ type = 'SINGLE_CHOICE' };
  options = @(
    @{ text = 'Atenolol'; isCorrect = $true },
    @{ text = 'Aspirin'; isCorrect = $false }
  )
}
$sqv = $sq.workingVersion; if (-not $sqv) { $sqv = $sq.currentVersion }
if ($sqv.media.Count -ge 1) { Ok "SINGLE_CHOICE created with media" } else { Bad "media not persisted" }

Put $su "/questions/$($sq.id)/mappings/knowledge" @{ items = @(@{ knowledgeNodeId = $kHit.id }) } | Out-Null
Put $su "/questions/$($sq.id)/mappings/exams" @{ items = @(@{ examProfileId = $eHit.id }) } | Out-Null
Put $su "/questions/$($sq.id)/mappings/tags" @{ tags = @('imported', 'cardio') } | Out-Null

$detail = Get1 $su "/questions/$($sq.id)"
if ($detail.knowledgeNodeIds -contains $kHit.id) { Ok "knowledge mapping applied" } else { Bad "knowledge mapping missing" }
if ($detail.examProfileIds -contains $eHit.id) { Ok "exam mapping applied" } else { Bad "exam mapping missing" }
if (($detail.tags -contains 'imported') -and ($detail.tags -contains 'cardio')) { Ok "tags applied ($($detail.tags -join ','))" } else { Bad "tags missing (got $($detail.tags -join ','))" }

Write-Host "`n=== RESULT: $pass passed, $fail failed ===" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
