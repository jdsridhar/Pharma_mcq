# Moves every DRAFT question through the full workflow to PUBLISHED, as Super Admin
# (DRAFT -> submit -> REVIEW -> approve -> APPROVED -> publish -> PUBLISHED).
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
function Login($e, $p) { (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).accessToken }
function Hdr($t) { @{ Authorization = "Bearer $t" } }
function AllIds($t, $status) {
  $ids = @()
  for ($page = 1; $page -le 200; $page++) {
    $res = Invoke-RestMethod -Uri "$base/questions?pageSize=100&page=$page$(if($status){"&status=$status"})" -Headers (Hdr $t)
    $ids += $res.items.id
    if ($res.items.Count -lt 100 -or ($page * 100) -ge $res.meta.total) { break }
  }
  return $ids
}
function Bulk($t, $ids, $action) {
  if ($ids.Count -eq 0) { return [pscustomobject]@{ succeeded = 0; failed = 0; total = 0 } }
  Invoke-RestMethod -Uri "$base/questions/bulk" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body (@{ ids = $ids; action = $action } | ConvertTo-Json)
}

$su = Login 'admin@pharmacy-mcq.local' 'ChangeMe_Admin1'
Write-Host '=== Publish all questions (Super Admin) ===' -ForegroundColor Cyan

$draft = AllIds $su 'DRAFT'
$r1 = Bulk $su $draft 'submit'
Write-Host "submit  : $($r1.succeeded)/$($r1.total) -> REVIEW"

$review = AllIds $su 'REVIEW'
$r2 = Bulk $su $review 'approve'
Write-Host "approve : $($r2.succeeded)/$($r2.total) -> APPROVED"

$approved = AllIds $su 'APPROVED'
$r3 = Bulk $su $approved 'publish'
Write-Host "publish : $($r3.succeeded)/$($r3.total) -> PUBLISHED"

# Final status breakdown
$counts = @{}
foreach ($s in 'DRAFT','REVIEW','APPROVED','PUBLISHED','ARCHIVED') {
  $res = Invoke-RestMethod -Uri "$base/questions?pageSize=1&status=$s" -Headers (Hdr $su)
  $counts[$s] = $res.meta.total
}
Write-Host "`nFinal: DRAFT=$($counts['DRAFT']) REVIEW=$($counts['REVIEW']) APPROVED=$($counts['APPROVED']) PUBLISHED=$($counts['PUBLISHED'])" -ForegroundColor Green
