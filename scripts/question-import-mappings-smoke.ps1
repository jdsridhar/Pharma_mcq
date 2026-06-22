# Verifies the bulk-import mapping pipeline end-to-end: resolve knowledge/exam codes and
# curriculum-node / track-module "PARENT>CHILD" references exactly like the import page, apply them,
# and confirm the question detail reflects every mapping.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
$pass = 0; $fail = 0
function Ok($m)  { Write-Host "PASS: $m" -ForegroundColor Green; $script:pass++ }
function Bad($m) { Write-Host "FAIL: $m" -ForegroundColor Red;   $script:fail++ }
function Login($e, $p) { (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).accessToken }
function Hdr($t) { @{ Authorization = "Bearer $t" } }
function GET($t, $path) { Invoke-RestMethod -Uri "$base$path" -Method Get -Headers (Hdr $t) }
function POST($t, $path, $obj) { Invoke-RestMethod -Uri "$base$path" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body ($obj | ConvertTo-Json -Depth 8) }
function PUT($t, $path, $obj) { Invoke-RestMethod -Uri "$base$path" -Method Put -Headers (Hdr $t) -ContentType 'application/json' -Body ($obj | ConvertTo-Json -Depth 8) }
function Flatten($nodes, $acc) { foreach ($n in $nodes) { $acc.Add($n) | Out-Null; if ($n.children) { Flatten $n.children $acc } } }

$ts = Get-Random
Write-Host "=== question-import mappings smoke (run $ts) ===" -ForegroundColor Cyan
$su = Login 'admin@pharmacy-mcq.local' 'ChangeMe_Admin1'

# 1) Seed the referenceable content (shared / platform).
POST $su '/knowledge/nodes' @{ code = "QCK$ts"; name = "QC Knowledge"; type = 'CONCEPT' } | Out-Null
POST $su '/exams' @{ code = "QCE$ts"; name = "QC Exam"; status = 'DRAFT' } | Out-Null
$cur = POST $su '/curriculums' @{ code = "QCC$ts"; name = "QC Curriculum"; status = 'DRAFT' }
POST $su "/curriculums/$($cur.id)/nodes" @{ name = 'Pharma Node'; code = "QCN$ts"; displayOrder = 0 } | Out-Null
$trk = POST $su '/tracks' @{ code = "QCT$ts"; name = "QC Track"; status = 'DRAFT' }
POST $su "/tracks/$($trk.id)/modules" @{ name = 'Module One'; displayOrder = 0 } | Out-Null
Ok 'seeded knowledge/exam/curriculum(+node)/track(+module)'

# 2) Resolve references the same way the importer does.
$kId = (GET $su "/knowledge/nodes?search=QCK$ts&pageSize=100").items | Where-Object { $_.code -eq "QCK$ts" } | Select-Object -First 1 -ExpandProperty id
$eId = (GET $su '/exams?pageSize=100').items | Where-Object { $_.code -eq "QCE$ts" } | Select-Object -First 1 -ExpandProperty id
$cId = (GET $su '/curriculums?pageSize=100').items | Where-Object { $_.code -eq "QCC$ts" } | Select-Object -First 1 -ExpandProperty id
$nodes = New-Object System.Collections.ArrayList; Flatten (GET $su "/curriculums/$cId/tree") $nodes
$nId = $nodes | Where-Object { $_.code -eq "QCN$ts" } | Select-Object -First 1 -ExpandProperty id
$tId = (GET $su '/tracks?pageSize=100').items | Where-Object { $_.code -eq "QCT$ts" } | Select-Object -First 1 -ExpandProperty id
$mId = (GET $su "/tracks/$tId").modules | Where-Object { $_.name -eq 'Module One' } | Select-Object -First 1 -ExpandProperty id
if ($kId -and $eId -and $nId -and $mId) { Ok "resolved refs (curriculum node by CODE, track module by NAME)" } else { Bad "resolution failed (k=$kId e=$eId node=$nId module=$mId)"; exit 1 }

# 3) Create a question and apply ALL mappings (as the importer does).
$q = POST $su '/questions' @{
  questionCode = "MAP-$ts"; questionType = 'SINGLE_CHOICE'; authorDifficulty = 'EASY'; language = 'en'
  questionText = "Mapping pipeline question $ts"; answerSpec = @{ type = 'SINGLE_CHOICE' }
  options = @(@{ text = 'A'; isCorrect = $true }, @{ text = 'B'; isCorrect = $false })
}
PUT $su "/questions/$($q.id)/mappings/knowledge"  @{ items = @(@{ knowledgeNodeId = $kId }) } | Out-Null
PUT $su "/questions/$($q.id)/mappings/exams"       @{ items = @(@{ examProfileId = $eId }) } | Out-Null
PUT $su "/questions/$($q.id)/mappings/curriculum"  @{ items = @(@{ curriculumNodeId = $nId }) } | Out-Null
PUT $su "/questions/$($q.id)/mappings/tracks"      @{ items = @(@{ trackModuleId = $mId }) } | Out-Null
PUT $su "/questions/$($q.id)/mappings/tags"        @{ tags = @('bulk', 'mapped') } | Out-Null

# 4) Verify the question detail reflects every mapping.
$d = GET $su "/questions/$($q.id)"
if ($d.knowledgeNodeIds -contains $kId) { Ok 'knowledge mapping applied' } else { Bad 'knowledge mapping missing' }
if ($d.examProfileIds -contains $eId)   { Ok 'exam mapping applied' }      else { Bad 'exam mapping missing' }
if ($d.curriculumNodeIds -contains $nId){ Ok 'curriculum-node mapping applied' } else { Bad 'curriculum mapping missing' }
if ($d.trackModuleIds -contains $mId)   { Ok 'track-module mapping applied' }    else { Bad 'track mapping missing' }
if ($d.tags -contains 'bulk')           { Ok 'tags applied' }              else { Bad 'tags missing' }

Write-Host "`n=== RESULT: $pass passed, $fail failed ===" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
