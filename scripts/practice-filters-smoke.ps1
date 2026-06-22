# Verifies a STUDENT can start practice both randomly and with each filter (topic/exam/curriculum/
# track/difficulty), against the published pool.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
$pass = 0; $fail = 0
function Ok($m)  { Write-Host "PASS: $m" -ForegroundColor Green; $script:pass++ }
function Bad($m) { Write-Host "FAIL: $m" -ForegroundColor Red;   $script:fail++ }
function Login($e, $p) { (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).accessToken }
function Hdr($t) { @{ Authorization = "Bearer $t" } }
function GET($t, $p) { Invoke-RestMethod -Uri "$base$p" -Method Get -Headers (Hdr $t) }
function Start($t, $body) { Invoke-RestMethod -Uri "$base/practice/sessions" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body ($body | ConvertTo-Json) }
function Flatten($nodes, $acc) { foreach ($n in $nodes) { $acc.Add($n) | Out-Null; if ($n.children) { Flatten $n.children $acc } } }

$stu = Login 'student@demo.local' 'Demo@12345'
Write-Host '=== practice filters smoke (student) ===' -ForegroundColor Cyan

# Resolve filter ids (student has read perms)
$examId = (GET $stu '/exams?pageSize=100').items | Where-Object { $_.code -eq 'GPAT' } | Select-Object -First 1 -ExpandProperty id
$topicId = (GET $stu '/knowledge/nodes?pageSize=100').items | Where-Object { $_.code -eq 'PHARMACOLOGY' } | Select-Object -First 1 -ExpandProperty id
$curId = (GET $stu '/curriculums?pageSize=100').items | Where-Object { $_.code -eq 'BPHARM-SYL' } | Select-Object -First 1 -ExpandProperty id
$nodes = New-Object System.Collections.ArrayList; Flatten (GET $stu "/curriculums/$curId/tree") $nodes
$curNodeId = $nodes | Where-Object { $_.name -eq 'Pharmacology' } | Select-Object -First 1 -ExpandProperty id
$trkId = (GET $stu '/tracks?pageSize=100').items | Where-Object { $_.code -eq 'GPAT-PREP' } | Select-Object -First 1 -ExpandProperty id
$modId = (GET $stu "/tracks/$trkId").modules | Where-Object { $_.name -eq 'Pharmacology' } | Select-Object -First 1 -ExpandProperty id

function Chk($label, $body) {
  try { $s = Start $stu $body; if ($s.questions.Count -gt 0) { Ok "$label -> $($s.questions.Count) questions" } else { Bad "$label -> 0 questions" } }
  catch { $c = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }; Bad "$label -> error $c" }
}

Chk 'random (no filters)'      @{ count = 5 }
Chk 'exam = GPAT'              @{ count = 5; examProfileId = $examId }
Chk 'topic = Pharmacology'     @{ count = 5; knowledgeNodeIds = @($topicId) }
Chk 'curriculum node'          @{ count = 5; curriculumNodeId = $curNodeId }
Chk 'track module'             @{ count = 5; trackModuleId = $modId }
Chk 'difficulty = EASY'        @{ count = 5; difficulty = 'EASY' }
Chk 'exam + difficulty combo'  @{ count = 5; examProfileId = $examId; difficulty = 'MEDIUM' }

# A filter that matches nothing should be a clean 400, not a crash.
try { Start $stu @{ count = 5; knowledgeNodeIds = @('00000000-0000-0000-0000-0000000000aa') } | Out-Null; Bad 'no-match filter unexpectedly succeeded' }
catch { $c = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }; if ($c -eq 400) { Ok 'no-match filter -> 400 (clean)' } else { Bad "no-match expected 400, got $c" } }

Write-Host "`n=== RESULT: $pass passed, $fail failed ===" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
