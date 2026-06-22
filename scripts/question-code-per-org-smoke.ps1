# Verifies questionCode uniqueness is per-organization (not global):
#  - same code twice in one org → 2nd rejected (409)
#  - same code in a different org → allowed (no cross-tenant collision)
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
$pass = 0; $fail = 0
function Ok($m)  { Write-Host "PASS: $m" -ForegroundColor Green; $script:pass++ }
function Bad($m) { Write-Host "FAIL: $m" -ForegroundColor Red;   $script:fail++ }
function Login($e, $p) { (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).accessToken }
function Hdr($t) { @{ Authorization = "Bearer $t" } }
function CreateQ($t, $code) {
  $body = @{
    questionCode = $code; questionType = 'SINGLE_CHOICE'; authorDifficulty = 'EASY'; language = 'en'
    questionText = "Sample question for $code (needs length)"
    answerSpec = @{ type = 'SINGLE_CHOICE' }
    options = @(@{ text = 'Correct'; isCorrect = $true }, @{ text = 'Wrong'; isCorrect = $false })
  } | ConvertTo-Json -Depth 8
  Invoke-RestMethod -Uri "$base/questions" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body $body
}
function Status($sb) { try { & $sb | Out-Null; 201 } catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 } } }

$ts = Get-Random
Write-Host "=== questionCode per-org smoke (run $ts) ===" -ForegroundColor Cyan
$su = Login 'admin@pharmacy-mcq.local' 'ChangeMe_Admin1'
$adminRoleId = ((Invoke-RestMethod -Uri "$base/admin/roles" -Headers (Hdr $su)) | Where-Object { $_.name -eq 'Admin' }).id

# Two institutions, each with an admin (Admin role can author questions)
$code = "DUP-$ts"
$orgA = Invoke-RestMethod -Uri "$base/admin/organizations" -Method Post -Headers (Hdr $su) -ContentType 'application/json' -Body (@{name="QC A $ts";slug="qc-a-$ts"}|ConvertTo-Json)
$orgB = Invoke-RestMethod -Uri "$base/admin/organizations" -Method Post -Headers (Hdr $su) -ContentType 'application/json' -Body (@{name="QC B $ts";slug="qc-b-$ts"}|ConvertTo-Json)
foreach ($o in @($orgA, $orgB)) {
  $mail = "qc-$($o.slug)@demo.local"
  Invoke-RestMethod -Uri "$base/admin/users" -Method Post -Headers (Hdr $su) -ContentType 'application/json' -Body (@{name="QC Admin";email=$mail;password='Demo@12345';roleId=$adminRoleId;organizationId=$o.id}|ConvertTo-Json) | Out-Null
}
$ta = Login "qc-$($orgA.slug)@demo.local" 'Demo@12345'
$tb = Login "qc-$($orgB.slug)@demo.local" 'Demo@12345'

# Org A: first create OK, duplicate rejected
$s1 = Status { CreateQ $ta $code }
if ($s1 -eq 201) { Ok "Org A create '$code' (201)" } else { Bad "Org A first create expected 201, got $s1" }
$s2 = Status { CreateQ $ta $code }
if ($s2 -eq 409) { Ok "Org A duplicate '$code' rejected (409)" } else { Bad "Org A duplicate expected 409, got $s2" }

# Org B: SAME code is allowed (independent namespace) — the multi-tenant fix
$s3 = Status { CreateQ $tb $code }
if ($s3 -eq 201) { Ok "Org B create same '$code' allowed (201) - no cross-tenant collision" } else { Bad "Org B same code expected 201, got $s3" }

Write-Host "`n=== RESULT: $pass passed, $fail failed ===" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
