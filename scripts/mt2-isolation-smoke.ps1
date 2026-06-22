# MT-2 multi-tenant content isolation smoke test.
# Verifies: institution-private content (curriculum/exam/track/mock-test) created by org Alpha
# is invisible & unmanageable to org Beta, visible to Alpha and to the Super Admin.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
$pass = 0; $fail = 0
function Ok($m)   { Write-Host "PASS: $m" -ForegroundColor Green; $script:pass++ }
function Bad($m)  { Write-Host "FAIL: $m" -ForegroundColor Red;   $script:fail++ }

function Login($email, $pwd) {
  $r = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email = $email; password = $pwd } | ConvertTo-Json)
  return $r.accessToken
}
function Hdr($tok) { return @{ Authorization = "Bearer $tok" } }
function Post($tok, $path, $body) {
  return Invoke-RestMethod -Uri "$base$path" -Method Post -Headers (Hdr $tok) `
    -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8)
}
function Get-List($tok, $path) { return Invoke-RestMethod -Uri "$base$path" -Method Get -Headers (Hdr $tok) }
# Run $sb; expect it to throw with the given HTTP status code.
function ExpectStatus($sb, $want, $label) {
  try { & $sb | Out-Null; Bad "$label (expected $want, got success)" }
  catch {
    $code = -1
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq $want) { Ok "$label ($want)" } else { Bad "$label (expected $want, got $code)" }
  }
}

$ts = Get-Random
Write-Host "=== MT-2 isolation smoke (run id $ts) ===" -ForegroundColor Cyan

# 1) Super admin + Admin role id
$su = Login 'admin@pharmacy-mcq.local' 'ChangeMe_Admin1'
$roles = Get-List $su '/admin/roles'
$adminRoleId = ($roles | Where-Object { $_.name -eq 'Admin' }).id
if ($adminRoleId) { Ok "resolved Admin roleId" } else { Bad "could not resolve Admin roleId"; exit 1 }

# 2) Two institutions
$alpha = Post $su '/admin/organizations' @{ name = "Acad Alpha $ts"; slug = "acad-alpha-$ts" }
$beta  = Post $su '/admin/organizations' @{ name = "Acad Beta $ts";  slug = "acad-beta-$ts" }
Ok "created orgs Alpha=$($alpha.id) Beta=$($beta.id)"

# 3) An admin in each institution
$aMail = "alpha-admin-$ts@demo.local"; $bMail = "beta-admin-$ts@demo.local"; $pw = 'Demo@12345'
Post $su '/admin/users' @{ name = "Alpha Admin"; email = $aMail; password = $pw; roleId = $adminRoleId; organizationId = $alpha.id } | Out-Null
Post $su '/admin/users' @{ name = "Beta Admin";  email = $bMail; password = $pw; roleId = $adminRoleId; organizationId = $beta.id  } | Out-Null
$at = Login $aMail $pw
$bt = Login $bMail $pw
Ok "logged in both institution admins"

# 4) Alpha authors institution-private content
$cur = Post $at '/curriculums' @{ code = "ALPHA-CUR-$ts"; name = "Alpha Curriculum"; status = 'DRAFT' }
$exm = Post $at '/exams'       @{ code = "ALPHA-EX-$ts";  name = "Alpha Exam";       status = 'DRAFT' }
$trk = Post $at '/tracks'      @{ code = "ALPHA-TR-$ts";  name = "Alpha Track";      status = 'DRAFT' }
$mt  = Post $at '/mock-tests'  @{ code = "ALPHA-MT-$ts"; title = "Alpha Mock"; mode = 'FIXED'; durationMinutes = 30; totalQuestions = 5; status = 'DRAFT' }
Ok "Alpha created curriculum/exam/track/mock-test"

# 5) Beta must NOT see Alpha's private content in lists
$bCur = Get-List $bt '/curriculums'; if ($bCur.items.id -contains $cur.id) { Bad "Beta sees Alpha curriculum in list" } else { Ok "Beta list excludes Alpha curriculum" }
$bExm = Get-List $bt '/exams';       if ($bExm.items.id -contains $exm.id) { Bad "Beta sees Alpha exam in list" }       else { Ok "Beta list excludes Alpha exam" }
$bTrk = Get-List $bt '/tracks';      if ($bTrk.items.id -contains $trk.id) { Bad "Beta sees Alpha track in list" }      else { Ok "Beta list excludes Alpha track" }
$bMt  = Get-List $bt '/mock-tests';  if ($bMt.items.id  -contains $mt.id)  { Bad "Beta sees Alpha mock-test in list" }  else { Ok "Beta list excludes Alpha mock-test" }

# 6) Beta must NOT read Alpha's private content by id (404)
ExpectStatus { Get-List $bt "/curriculums/$($cur.id)" } 404 "Beta GET Alpha curriculum by id"
ExpectStatus { Get-List $bt "/exams/$($exm.id)" }       404 "Beta GET Alpha exam by id"
ExpectStatus { Get-List $bt "/tracks/$($trk.id)" }      404 "Beta GET Alpha track by id"
ExpectStatus { Get-List $bt "/mock-tests/$($mt.id)" }   404 "Beta GET Alpha mock-test by id"

# 7) Beta must NOT manage Alpha's private content (404 — cross-org hidden)
ExpectStatus { Invoke-RestMethod -Uri "$base/curriculums/$($cur.id)" -Method Patch -Headers (Hdr $bt) -ContentType 'application/json' -Body (@{ name = 'hijack' } | ConvertTo-Json) } 404 "Beta PATCH Alpha curriculum"
ExpectStatus { Invoke-RestMethod -Uri "$base/mock-tests/$($mt.id)"  -Method Patch -Headers (Hdr $bt) -ContentType 'application/json' -Body (@{ title = 'hijack' } | ConvertTo-Json) } 404 "Beta PATCH Alpha mock-test"

# 8) Alpha CAN see & read its own content
$aCur = Get-List $at '/curriculums'; if ($aCur.items.id -contains $cur.id) { Ok "Alpha list includes own curriculum" } else { Bad "Alpha cannot see own curriculum" }
try { Get-List $at "/curriculums/$($cur.id)" | Out-Null; Ok "Alpha GET own curriculum (200)" } catch { Bad "Alpha GET own curriculum failed" }
try { Get-List $at "/mock-tests/$($mt.id)" | Out-Null; Ok "Alpha GET own mock-test (200)" } catch { Bad "Alpha GET own mock-test failed" }

# 9) Super Admin can read any org's content (read by id is unambiguous vs. a paginated list scan).
try { Get-List $su "/curriculums/$($cur.id)" | Out-Null; Ok "Super reads Alpha curriculum (200)" } catch { Bad "Super cannot read Alpha curriculum" }
try { Get-List $su "/mock-tests/$($mt.id)" | Out-Null; Ok "Super reads Alpha mock-test (200)" } catch { Bad "Super cannot read Alpha mock-test" }
# And the search-filtered list surfaces it for Super (avoids pagination flakiness).
$sCur = Get-List $su "/curriculums?search=ALPHA-CUR-$ts"; if ($sCur.items.id -contains $cur.id) { Ok "Super sees Alpha curriculum (search)" } else { Bad "Super cannot see Alpha curriculum via search" }

Write-Host "`n=== RESULT: $pass passed, $fail failed ===" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
