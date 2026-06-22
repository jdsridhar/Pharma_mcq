# Verifies bulk question workflow actions end-to-end (create throwaways -> submit -> reject ->
# approve -> publish), plus permission denial, then cleans up.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
$pass = 0; $fail = 0
function Ok($m)  { Write-Host "PASS: $m" -ForegroundColor Green; $script:pass++ }
function Bad($m) { Write-Host "FAIL: $m" -ForegroundColor Red;   $script:fail++ }
function Login($e, $p) { (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).accessToken }
function Hdr($t) { @{ Authorization = "Bearer $t" } }
function GET($t, $p) { Invoke-RestMethod -Uri "$base$p" -Method Get -Headers (Hdr $t) }
function Bulk($t, $ids, $action) { Invoke-RestMethod -Uri "$base/questions/bulk" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body (@{ ids=$ids; action=$action } | ConvertTo-Json) }
function StatusOf($t, $id) { (GET $t "/questions/$id").status }
function MakeQ($t, $code) {
  $b = @{ questionCode=$code; questionType='SINGLE_CHOICE'; authorDifficulty='EASY'; language='en'; questionText="Bulk workflow test $code"; answerSpec=@{type='SINGLE_CHOICE'}; options=@(@{text='A';isCorrect=$true},@{text='B';isCorrect=$false}) } | ConvertTo-Json -Depth 8
  (Invoke-RestMethod -Uri "$base/questions" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body $b).id
}

$ts = Get-Random
Write-Host "=== bulk actions smoke (run $ts) ===" -ForegroundColor Cyan
$su = Login 'admin@pharmacy-mcq.local' 'ChangeMe_Admin1'

# Create 3 throwaway DRAFT questions
$ids = @((MakeQ $su "BULKT-$ts-1"), (MakeQ $su "BULKT-$ts-2"), (MakeQ $su "BULKT-$ts-3"))
Ok "created 3 DRAFT questions"

# Bulk submit all 3 -> REVIEW
$r = Bulk $su $ids 'submit'
if ($r.succeeded -eq 3 -and ((StatusOf $su $ids[0]) -eq 'REVIEW')) { Ok "bulk submit: 3/3 -> REVIEW" } else { Bad "bulk submit failed (succeeded=$($r.succeeded), status=$(StatusOf $su $ids[0]))" }

# Bulk reject the first -> DRAFT
$r = Bulk $su @($ids[0]) 'reject'
if ($r.succeeded -eq 1 -and ((StatusOf $su $ids[0]) -eq 'DRAFT')) { Ok "bulk reject: 1 -> DRAFT" } else { Bad "bulk reject failed (status=$(StatusOf $su $ids[0]))" }

# Bulk approve the other two (still REVIEW) -> APPROVED
$r = Bulk $su @($ids[1], $ids[2]) 'approve'
if ($r.succeeded -eq 2 -and ((StatusOf $su $ids[1]) -eq 'APPROVED')) { Ok "bulk approve: 2/2 -> APPROVED" } else { Bad "bulk approve failed (succeeded=$($r.succeeded))" }

# Bulk publish those two -> PUBLISHED
$r = Bulk $su @($ids[1], $ids[2]) 'publish'
if ($r.succeeded -eq 2 -and ((StatusOf $su $ids[1]) -eq 'PUBLISHED')) { Ok "bulk publish: 2/2 -> PUBLISHED" } else { Bad "bulk publish failed (succeeded=$($r.succeeded))" }

# Partial failure: approve a mix (one DRAFT id[0] cannot be approved) -> 1 fail reported, not a crash
$r = Bulk $su @($ids[0]) 'approve'
if ($r.failed -eq 1 -and $r.succeeded -eq 0) { Ok "bulk approve on DRAFT reports failure (not crash)" } else { Bad "expected 1 failed, got succeeded=$($r.succeeded) failed=$($r.failed)" }

# Permission denial: a Student cannot bulk-approve (lacks question:approve) -> 403
$stu = Login 'student@demo.local' 'Demo@12345'
try { Bulk $stu @($ids[1]) 'approve' | Out-Null; Bad "student bulk approve succeeded (expected 403)" }
catch { $c = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }; if ($c -eq 403) { Ok "student bulk approve denied (403)" } else { Bad "student bulk approve expected 403, got $c" } }

# Cleanup: bulk delete the throwaways
$r = Bulk $su $ids 'delete'
if ($r.succeeded -eq 3) { Ok "bulk delete cleanup: 3/3" } else { Bad "cleanup delete failed (succeeded=$($r.succeeded))" }

Write-Host "`n=== RESULT: $pass passed, $fail failed ===" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
