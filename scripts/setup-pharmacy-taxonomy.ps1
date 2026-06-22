# Creates the shared taxonomy referenced by pharmacy-questions-v2.xlsx so its mappings resolve:
# knowledge nodes (+ a few edges), exam profiles, the BPHARM-SYL curriculum (+ nodes), and the
# GPAT-PREP track (+ modules). Idempotent — safe to re-run (existing items are skipped).
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
function Login($e, $p) { (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$e;password=$p}|ConvertTo-Json)).accessToken }
function Hdr($t) { @{ Authorization = "Bearer $t" } }
function GET($t, $path) { Invoke-RestMethod -Uri "$base$path" -Method Get -Headers (Hdr $t) }
function POST($t, $path, $obj) {
  try { return Invoke-RestMethod -Uri "$base$path" -Method Post -Headers (Hdr $t) -ContentType 'application/json' -Body ($obj | ConvertTo-Json -Depth 8) }
  catch { $c = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }; if ($c -eq 409) { return $null } throw }
}

$su = Login 'admin@pharmacy-mcq.local' 'ChangeMe_Admin1'
Write-Host '=== Pharmacy taxonomy setup ===' -ForegroundColor Cyan

# 1) Knowledge nodes
$kNodes = @(
  @{ code='PHARMACOLOGY'; name='Pharmacology'; type='SUBJECT' },
  @{ code='MED-CHEM'; name='Medicinal Chemistry'; type='SUBJECT' },
  @{ code='PHARMACEUTICS'; name='Pharmaceutics'; type='SUBJECT' },
  @{ code='PHARMACOGNOSY'; name='Pharmacognosy'; type='SUBJECT' },
  @{ code='PHARM-ANALYSIS'; name='Pharmaceutical Analysis'; type='SUBJECT' },
  @{ code='PHARMACOKINETICS'; name='Pharmacokinetics'; type='TOPIC' },
  @{ code='CLIN-PHARM'; name='Clinical Pharmacy'; type='SUBJECT' },
  @{ code='MICROBIOLOGY'; name='Microbiology'; type='SUBJECT' },
  @{ code='BIOCHEMISTRY'; name='Biochemistry'; type='SUBJECT' },
  @{ code='ANATOMY-PHYSIO'; name='Human Anatomy and Physiology'; type='SUBJECT' },
  @{ code='TOXICOLOGY'; name='Toxicology'; type='TOPIC' },
  @{ code='PHARM-JURIS'; name='Pharmaceutical Jurisprudence'; type='SUBJECT' }
)
$existingK = @{}
foreach ($n in (GET $su '/knowledge/nodes?pageSize=100').items) { $existingK[$n.code] = $n.id }
$kCreated = 0
foreach ($k in $kNodes) {
  if ($existingK.ContainsKey($k.code)) { continue }
  $r = POST $su '/knowledge/nodes' $k
  if ($r) { $existingK[$k.code] = $r.id; $kCreated++ }
}
# refresh ids (covers DEMO-PHARMA + any newly created)
foreach ($n in (GET $su '/knowledge/nodes?pageSize=100').items) { $existingK[$n.code] = $n.id }
Write-Host "knowledge nodes: +$kCreated (total mapped: $($existingK.Count))"

# 2) A few knowledge edges (DAG: prerequisite / part-of)
$edges = @(
  @{ parentNodeId=$existingK['PHARMACOKINETICS']; childNodeId=$existingK['PHARMACOLOGY']; relationshipType='PART_OF' },
  @{ parentNodeId=$existingK['TOXICOLOGY']; childNodeId=$existingK['PHARMACOLOGY']; relationshipType='PART_OF' },
  @{ parentNodeId=$existingK['BIOCHEMISTRY']; childNodeId=$existingK['PHARMACOLOGY']; relationshipType='PREREQUISITE_OF' },
  @{ parentNodeId=$existingK['ANATOMY-PHYSIO']; childNodeId=$existingK['PHARMACOLOGY']; relationshipType='PREREQUISITE_OF' },
  @{ parentNodeId=$existingK['PHARMACOLOGY']; childNodeId=$existingK['CLIN-PHARM']; relationshipType='PREREQUISITE_OF' }
)
$eCreated = 0
foreach ($e in $edges) { if ($e.parentNodeId -and $e.childNodeId) { try { if (POST $su '/knowledge/edges' $e) { $eCreated++ } } catch {} } }
Write-Host "knowledge edges: +$eCreated"

# 3) Exam profiles
$exams = @(
  @{ code='GPAT'; name='Graduate Pharmacy Aptitude Test'; status='DRAFT' },
  @{ code='NIPER'; name='NIPER Joint Entrance Exam'; status='DRAFT' },
  @{ code='DI'; name='Drug Inspector Examination'; status='DRAFT' }
)
$existingE = @{}; foreach ($x in (GET $su '/exams?pageSize=100').items) { $existingE[$x.code] = $x.id }
$xCreated = 0
foreach ($x in $exams) { if (-not $existingE.ContainsKey($x.code)) { if (POST $su '/exams' $x) { $xCreated++ } } }
Write-Host "exam profiles: +$xCreated"

# 4) Curriculum BPHARM-SYL + nodes
$curNodeNames = @('Pharmacology','Medicinal Chemistry','Pharmaceutics','Pharmacognosy','Pharmaceutical Analysis','Biopharmaceutics','Pharmacy Practice','Microbiology','Biochemistry','Human Anatomy and Physiology','Jurisprudence')
$cur = (GET $su '/curriculums?pageSize=100').items | Where-Object { $_.code -eq 'BPHARM-SYL' } | Select-Object -First 1
if (-not $cur) { $cur = POST $su '/curriculums' @{ code='BPHARM-SYL'; name='B.Pharm Syllabus'; status='DRAFT' } }
$existingNodeNames = @{}
function Collect($nodes) { foreach ($n in $nodes) { $script:existingNodeNames[$n.name] = $true; if ($n.children) { Collect $n.children } } }
Collect (GET $su "/curriculums/$($cur.id)/tree")
$nCreated = 0; $i = 0
foreach ($nm in $curNodeNames) { if (-not $existingNodeNames.ContainsKey($nm)) { if (POST $su "/curriculums/$($cur.id)/nodes" @{ name=$nm; displayOrder=$i }) { $nCreated++ } }; $i++ }
Write-Host "curriculum BPHARM-SYL nodes: +$nCreated"

# 5) Track GPAT-PREP + modules
$modNames = @('Pharmacology','Medicinal Chemistry','Pharmaceutics','Pharmacognosy','Analysis','Pharmacokinetics','Clinical','Microbiology','Biochemistry','Physiology','Toxicology','Jurisprudence')
$trk = (GET $su '/tracks?pageSize=100').items | Where-Object { $_.code -eq 'GPAT-PREP' } | Select-Object -First 1
if (-not $trk) { $trk = POST $su '/tracks' @{ code='GPAT-PREP'; name='GPAT Preparation'; status='DRAFT' } }
$existingMods = @{}; foreach ($m in (GET $su "/tracks/$($trk.id)").modules) { $existingMods[$m.name] = $true }
$mCreated = 0; $i = 0
foreach ($nm in $modNames) { if (-not $existingMods.ContainsKey($nm)) { if (POST $su "/tracks/$($trk.id)/modules" @{ name=$nm; displayOrder=$i }) { $mCreated++ } }; $i++ }
Write-Host "track GPAT-PREP modules: +$mCreated"

Write-Host "`nTaxonomy ready. Upload pharmacy-questions-v2.xlsx and the mappings will resolve." -ForegroundColor Green
