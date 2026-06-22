# MT-3 institutional seat-billing smoke test.
# Verifies: Super Admin provisions a seat-limited institution plan to an org; onboarding is allowed
# up to the seat limit and blocked (409) beyond it; live seat usage is reported; re-provisioning a
# bigger plan frees seats.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
$pass = 0; $fail = 0
function Ok($m)  { Write-Host "PASS: $m" -ForegroundColor Green; $script:pass++ }
function Bad($m) { Write-Host "FAIL: $m" -ForegroundColor Red;   $script:fail++ }
function Login($e, $p) { (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).accessToken }
function Hdr($t) { @{ Authorization = "Bearer $t" } }
function Post($t, $path, $body) { Invoke-RestMethod -Uri "$base$path" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 6) }
function Get1($t, $path) { Invoke-RestMethod -Uri "$base$path" -Method Get -Headers (Hdr $t) }
function NewMember($t, $orgId, $mail) {
  Post $t '/admin/users' @{ name = 'Seat User'; email = $mail; password = 'Demo@12345'; organizationId = $orgId }
}

$ts = Get-Random
Write-Host "=== MT-3 seat-billing smoke (run id $ts) ===" -ForegroundColor Cyan
$su = Login 'admin@pharmacy-mcq.local' 'ChangeMe_Admin1'

# 1) Institution plan with a 3-seat cap
$plan = Post $su '/commerce/plans' @{ code = "INST-SEAT-$ts"; name = "Institution Seat $ts"; seatLimit = 3 }
if ($plan.seatLimit -eq 3) { Ok "created institution plan (seatLimit=3)" } else { Bad "plan seatLimit not persisted (got $($plan.seatLimit))" }

# 2) An organization, no subscription yet
$org = Post $su '/admin/organizations' @{ name = "Seat Acad $ts"; slug = "seat-acad-$ts" }
# A `null` return serializes as an empty 200 body; PowerShell surfaces that as '' (not $null).
$none = Get1 $su "/admin/organizations/$($org.id)/subscription"
if (-not $none) { Ok "org has no subscription initially (empty)" } else { Bad "expected no subscription, got one" }

# 3) Provision the seat plan
$sub = Post $su "/admin/organizations/$($org.id)/subscription" @{ planId = $plan.id }
if ($sub.seatLimit -eq 3 -and $sub.seatsUsed -eq 0 -and $sub.seatsAvailable -eq 3) { Ok "provisioned: 0/3 seats used" } else { Bad "unexpected seat usage after provision: used=$($sub.seatsUsed) limit=$($sub.seatLimit) avail=$($sub.seatsAvailable)" }

# 4) Onboard up to the cap (3 members)
NewMember $su $org.id "seat1-$ts@demo.local" | Out-Null
NewMember $su $org.id "seat2-$ts@demo.local" | Out-Null
NewMember $su $org.id "seat3-$ts@demo.local" | Out-Null
$used = Get1 $su "/admin/organizations/$($org.id)/subscription"
if ($used.seatsUsed -eq 3 -and $used.seatsAvailable -eq 0) { Ok "3/3 seats used after onboarding" } else { Bad "expected 3/3 used, got used=$($used.seatsUsed) avail=$($used.seatsAvailable)" }

# 5) 4th onboarding is blocked (409)
try {
  NewMember $su $org.id "seat4-$ts@demo.local" | Out-Null
  Bad "4th member onboarding succeeded (expected 409 seat limit)"
} catch {
  $code = -1; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 409) { Ok "4th onboarding blocked by seat cap (409)" } else { Bad "4th onboarding expected 409, got $code" }
}

# 6) Upgrade to a 5-seat plan → seat frees up, 4th now succeeds
$plan5 = Post $su '/commerce/plans' @{ code = "INST-SEAT5-$ts"; name = "Institution Seat5 $ts"; seatLimit = 5 }
$sub5  = Post $su "/admin/organizations/$($org.id)/subscription" @{ planId = $plan5.id }
if ($sub5.seatLimit -eq 5 -and $sub5.seatsUsed -eq 3 -and $sub5.seatsAvailable -eq 2) { Ok "upgraded to 5 seats: 3/5 used, 2 available" } else { Bad "unexpected after upgrade: used=$($sub5.seatsUsed) limit=$($sub5.seatLimit) avail=$($sub5.seatsAvailable)" }
try { NewMember $su $org.id "seat4b-$ts@demo.local" | Out-Null; Ok "4th member onboarded after upgrade" } catch { Bad "4th onboarding failed after upgrade" }

# 7) Individual plan (no seatLimit) cannot be provisioned as an org seat plan (400)
$indiv = Post $su '/commerce/plans' @{ code = "INDIV-$ts"; name = "Individual $ts" }
if ($null -eq $indiv.seatLimit) { Ok "individual plan has null seatLimit" } else { Bad "individual plan unexpectedly has seatLimit" }
try {
  Post $su "/admin/organizations/$($org.id)/subscription" @{ planId = $indiv.id } | Out-Null
  Bad "provisioning an individual plan as org seats succeeded (expected 400)"
} catch {
  $code = -1; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 400) { Ok "individual plan rejected as org seat plan (400)" } else { Bad "expected 400, got $code" }
}

Write-Host "`n=== RESULT: $pass passed, $fail failed ===" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
