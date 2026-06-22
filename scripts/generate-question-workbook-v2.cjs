// Generates a NEW, non-colliding multi-sheet question workbook (import-template format), 30+
// pharmacy questions per type across all major subjects, with a fresh code scheme (PH2-*) and
// distinct text so it imports cleanly. Run from repo root:
//   NODE_PATH="apps/web/node_modules" node scripts/generate-question-workbook-v2.cjs
const ExcelJS = require('exceljs');
const path = require('path');

const HEAD = ['questionCode', 'difficulty', 'language', 'questionText', 'explanation'];
const CHOICE = ['optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'optionF', 'correct'];
const TAIL = ['knowledgeCodes', 'examCodes', 'curriculumNodes', 'trackModules', 'tags', 'mediaType', 'mediaUrl', 'mediaAltText'];

// Subject taxonomy → mapping columns (knowledge / curriculum node / track module / tag group).
const S = {
  PHCOL: { k: 'PHARMACOLOGY;DEMO-PHARMA', c: 'BPHARM-SYL>Pharmacology', t: 'GPAT-PREP>Pharmacology', g: 'pharmacology' },
  MCHEM: { k: 'MED-CHEM', c: 'BPHARM-SYL>Medicinal Chemistry', t: 'GPAT-PREP>Medicinal Chemistry', g: 'medicinal-chemistry' },
  PHTCS: { k: 'PHARMACEUTICS', c: 'BPHARM-SYL>Pharmaceutics', t: 'GPAT-PREP>Pharmaceutics', g: 'pharmaceutics' },
  PHGNY: { k: 'PHARMACOGNOSY', c: 'BPHARM-SYL>Pharmacognosy', t: 'GPAT-PREP>Pharmacognosy', g: 'pharmacognosy' },
  ANAL: { k: 'PHARM-ANALYSIS', c: 'BPHARM-SYL>Pharmaceutical Analysis', t: 'GPAT-PREP>Analysis', g: 'analysis' },
  PK: { k: 'PHARMACOKINETICS', c: 'BPHARM-SYL>Biopharmaceutics', t: 'GPAT-PREP>Pharmacokinetics', g: 'pharmacokinetics' },
  CLIN: { k: 'CLIN-PHARM', c: 'BPHARM-SYL>Pharmacy Practice', t: 'GPAT-PREP>Clinical', g: 'clinical' },
  MICRO: { k: 'MICROBIOLOGY', c: 'BPHARM-SYL>Microbiology', t: 'GPAT-PREP>Microbiology', g: 'microbiology' },
  BIOC: { k: 'BIOCHEMISTRY', c: 'BPHARM-SYL>Biochemistry', t: 'GPAT-PREP>Biochemistry', g: 'biochemistry' },
  PHYS: { k: 'ANATOMY-PHYSIO', c: 'BPHARM-SYL>Human Anatomy and Physiology', t: 'GPAT-PREP>Physiology', g: 'physiology' },
  TOX: { k: 'TOXICOLOGY', c: 'BPHARM-SYL>Pharmacology', t: 'GPAT-PREP>Toxicology', g: 'toxicology' },
  JURIS: { k: 'PHARM-JURIS', c: 'BPHARM-SYL>Jurisprudence', t: 'GPAT-PREP>Jurisprudence', g: 'jurisprudence' },
};
const DIFF = ['EASY', 'MEDIUM', 'HARD'];
const diff = (i) => DIFF[i % 3];
const exam = (i) => (i % 3 === 2 ? 'GPAT;NIPER' : i % 3 === 1 ? 'GPAT;DI' : 'GPAT');

// ── SINGLE_CHOICE: [subj, text, A,B,C,D, correctLetter, explanation] ─────────────────────────────
const SINGLE = [
  ['PHCOL', 'Which drug is a direct thrombin inhibitor used as an oral anticoagulant?', 'Dabigatran', 'Warfarin', 'Clopidogrel', 'Heparin', 'A', 'Dabigatran directly inhibits thrombin (factor IIa).'],
  ['PHCOL', 'Salbutamol relieves bronchospasm by acting as a:', 'Beta-2 adrenergic agonist', 'Beta-1 antagonist', 'Muscarinic agonist', 'Alpha-1 agonist', 'A', 'Salbutamol is a selective beta-2 agonist causing bronchodilation.'],
  ['PHCOL', 'The antiplatelet drug clopidogrel irreversibly blocks which receptor?', 'P2Y12 (ADP)', 'Thromboxane', 'GP IIb/IIIa', 'COX-1', 'A', 'Clopidogrel blocks the platelet P2Y12 ADP receptor.'],
  ['PHCOL', 'Which class does losartan belong to?', 'Angiotensin-II receptor blocker', 'ACE inhibitor', 'Calcium channel blocker', 'Beta-blocker', 'A', 'Losartan is an ARB (sartan).'],
  ['MCHEM', 'Fluoroquinolone antibacterials inhibit which bacterial enzyme(s)?', 'DNA gyrase and topoisomerase IV', 'Dihydrofolate reductase', 'RNA polymerase', 'Beta-lactamase', 'A', 'Fluoroquinolones inhibit DNA gyrase and topoisomerase IV.'],
  ['MCHEM', 'The "sartan" group of antihypertensives are chemically:', 'Biphenyl tetrazole derivatives', 'Beta-lactams', 'Sulfonylureas', 'Dihydropyridines', 'A', 'Most ARBs are biphenyl-tetrazole derivatives.'],
  ['MCHEM', 'Which functional group gives sulfonamides their antibacterial activity?', 'Para-amino benzenesulfonamide', 'Carboxylic acid', 'Quaternary ammonium', 'Nitro group', 'A', 'The p-aminobenzenesulfonamide moiety mimics PABA.'],
  ['PHTCS', 'Which is a non-ionic surfactant?', 'Polysorbate 80 (Tween 80)', 'Sodium lauryl sulfate', 'Benzalkonium chloride', 'Cetrimide', 'A', 'Tween 80 is non-ionic; SLS is anionic; the others are cationic.'],
  ['PHTCS', 'Geometric dilution is a technique used to:', 'Uniformly mix a small amount of potent drug with a large amount of excipient', 'Increase dissolution rate', 'Sterilize powders', 'Coat tablets', 'A', 'Geometric dilution ensures content uniformity of low-dose drugs.'],
  ['PHTCS', 'The process of reducing particle size is called:', 'Trituration / size reduction', 'Levigation', 'Flocculation', 'Lyophilization', 'A', 'Size reduction (comminution/trituration) reduces particle size.'],
  ['PHGNY', 'Senna owes its laxative action to:', 'Anthraquinone (sennoside) glycosides', 'Cardiac glycosides', 'Alkaloids', 'Tannins', 'A', 'Sennosides are anthraquinone glycosides.'],
  ['PHGNY', 'Vincristine and vinblastine are obtained from:', 'Catharanthus roseus (Vinca)', 'Cinchona', 'Papaver somniferum', 'Rauwolfia serpentina', 'A', 'Vinca alkaloids come from Catharanthus roseus.'],
  ['PHGNY', 'Reserpine, an antihypertensive alkaloid, is obtained from:', 'Rauwolfia serpentina', 'Digitalis purpurea', 'Ephedra', 'Cinchona', 'A', 'Reserpine is from Rauwolfia serpentina.'],
  ['ANAL', 'In HPLC, the stationary phase in reverse-phase chromatography is:', 'Non-polar (e.g., C18)', 'Highly polar silica', 'Ion-exchange resin', 'Alumina', 'A', 'Reverse-phase uses a non-polar (C18) stationary phase with a polar mobile phase.'],
  ['ANAL', 'Potentiometry measures:', 'Potential (voltage) to determine ion concentration', 'Absorbed light', 'Mass-to-charge ratio', 'Refractive index', 'A', 'Potentiometry measures electrode potential related to ion activity.'],
  ['ANAL', 'Which detector is specific to UV-absorbing compounds in HPLC?', 'UV-visible detector', 'Flame ionization detector', 'Thermal conductivity detector', 'Electron capture detector', 'A', 'UV detectors are common in HPLC; FID/TCD are GC detectors.'],
  ['PK', 'Bioavailability of an intravenous drug is, by definition:', '100%', '50%', '0%', 'Variable and always less than oral', 'A', 'IV administration has 100% bioavailability by definition.'],
  ['PK', 'Volume of distribution (Vd) relates the amount of drug in the body to its:', 'Plasma concentration', 'Urinary excretion rate', 'Half-life', 'Clearance only', 'A', 'Vd = amount in body / plasma concentration.'],
  ['PK', 'Enterohepatic recycling tends to:', 'Prolong a drug’s duration of action', 'Reduce half-life', 'Prevent absorption', 'Increase first-pass loss', 'A', 'Recirculation via bile prolongs the drug’s presence.'],
  ['CLIN', 'Which vitamin supplement is co-prescribed with isoniazid to prevent neuropathy?', 'Pyridoxine (B6)', 'Folic acid', 'Cyanocobalamin (B12)', 'Thiamine (B1)', 'A', 'Isoniazid causes B6 deficiency; pyridoxine prevents neuropathy.'],
  ['CLIN', 'Grapefruit juice increases levels of some drugs by inhibiting:', 'Intestinal CYP3A4', 'Renal tubular secretion', 'Plasma esterases', 'Gastric lipase', 'A', 'Grapefruit juice inhibits intestinal CYP3A4.'],
  ['CLIN', 'A patient on warfarin should be counselled to keep intake of which nutrient consistent?', 'Vitamin K (green leafy vegetables)', 'Vitamin C', 'Calcium', 'Iron', 'A', 'Vitamin K antagonises warfarin; intake should be consistent.'],
  ['MICRO', 'Which method sterilizes heat-labile solutions such as some injectables?', 'Membrane (0.22 micron) filtration', 'Autoclaving', 'Dry heat oven', 'Boiling', 'A', '0.22 micron membrane filtration removes bacteria from heat-labile fluids.'],
  ['MICRO', 'Penicillin acts by inhibiting synthesis of the bacterial:', 'Cell wall (peptidoglycan)', 'Cell membrane', 'Protein at 50S', 'Folate', 'A', 'Penicillins inhibit peptidoglycan cross-linking (transpeptidase).'],
  ['BIOC', 'The end product of glycolysis under aerobic conditions is:', 'Pyruvate', 'Lactate', 'Acetyl-CoA directly', 'Glucose-6-phosphate', 'A', 'Glycolysis yields pyruvate, which enters the TCA cycle aerobically.'],
  ['BIOC', 'Which vitamin functions as a coenzyme in transamination reactions?', 'Pyridoxal phosphate (B6)', 'Thiamine (B1)', 'Riboflavin (B2)', 'Folate', 'A', 'PLP (vitamin B6) is the coenzyme for transaminases.'],
  ['PHYS', 'The functional unit of the kidney is the:', 'Nephron', 'Alveolus', 'Hepatocyte', 'Sarcomere', 'A', 'The nephron is the kidney’s functional unit.'],
  ['PHYS', 'Which hormone lowers blood calcium levels?', 'Calcitonin', 'Parathyroid hormone', 'Cortisol', 'Glucagon', 'A', 'Calcitonin lowers serum calcium; PTH raises it.'],
  ['TOX', 'The antidote for benzodiazepine overdose is:', 'Flumazenil', 'Naloxone', 'Atropine', 'Physostigmine', 'A', 'Flumazenil is a benzodiazepine receptor antagonist.'],
  ['TOX', 'Chelation with desferrioxamine is used to treat poisoning by:', 'Iron', 'Lead', 'Mercury', 'Cyanide', 'A', 'Desferrioxamine chelates iron.'],
  ['JURIS', 'Under the Drugs and Cosmetics Act (India), Schedule H drugs are:', 'Prescription drugs', 'Narcotic drugs only', 'Cosmetics', 'Ayurvedic medicines', 'A', 'Schedule H lists prescription-only drugs.'],
  ['JURIS', 'A red line on the label (India) traditionally indicates the drug is:', 'To be sold on prescription only', 'For external use only', 'A Schedule X narcotic', 'A household remedy', 'A', 'A red line denotes prescription-only sale.'],
];

// ── MULTI_CHOICE: [subj, text, A,B,C,D,E, correctLetters, explanation] ───────────────────────────
const MULTI = [
  ['PHCOL', 'Which of the following are ACE inhibitors?', 'Enalapril', 'Ramipril', 'Valsartan', 'Lisinopril', 'Amlodipine', 'A;B;D', 'Valsartan is an ARB; amlodipine is a CCB.'],
  ['PHCOL', 'Which drugs are proton pump inhibitors?', 'Omeprazole', 'Ranitidine', 'Pantoprazole', 'Esomeprazole', 'Famotidine', 'A;C;D', 'Ranitidine and famotidine are H2 blockers.'],
  ['PHCOL', 'Which are recognised loop diuretics?', 'Furosemide', 'Torsemide', 'Spironolactone', 'Bumetanide', 'Hydrochlorothiazide', 'A;B;D', 'Spironolactone is K-sparing; HCTZ is a thiazide.'],
  ['MCHEM', 'Which agents are aminoglycoside antibiotics?', 'Gentamicin', 'Amikacin', 'Doxycycline', 'Tobramycin', 'Erythromycin', 'A;B;D', 'Doxycycline is a tetracycline; erythromycin is a macrolide.'],
  ['MCHEM', 'Which drugs contain a beta-lactam ring?', 'Penicillin G', 'Cephalexin', 'Aztreonam', 'Vancomycin', 'Meropenem', 'A;B;C;E', 'Vancomycin is a glycopeptide, not a beta-lactam.'],
  ['PHTCS', 'Which are parenteral routes of administration?', 'Intravenous', 'Intramuscular', 'Oral', 'Subcutaneous', 'Intradermal', 'A;B;D;E', 'Oral is enteral, not parenteral.'],
  ['PHTCS', 'Which factors increase the dissolution rate of a solid drug (Noyes-Whitney)?', 'Increased surface area', 'Increased solubility', 'Increased particle size', 'Increased agitation', 'Thicker diffusion layer', 'A;B;D', 'Larger particles and thicker diffusion layers slow dissolution.'],
  ['PHGNY', 'Which crude drugs yield cardiac glycosides?', 'Digitalis', 'Strophanthus', 'Cinchona', 'Squill', 'Nux vomica', 'A;B;D', 'Cinchona/Nux vomica give alkaloids, not cardiac glycosides.'],
  ['ANAL', 'Which are spectroscopic techniques?', 'UV-Visible', 'Infrared', 'NMR', 'HPLC', 'Mass spectrometry', 'A;B;C;E', 'HPLC is a separation (chromatographic) technique.'],
  ['PK', 'Which routes avoid hepatic first-pass metabolism?', 'Sublingual', 'Intravenous', 'Oral', 'Transdermal', 'Rectal (lower)', 'A;B;D;E', 'Oral absorption undergoes first-pass metabolism.'],
  ['CLIN', 'Which are recognised adverse effects of corticosteroids?', 'Hyperglycaemia', 'Osteoporosis', 'Immunosuppression', 'Weight loss', 'Cushingoid features', 'A;B;C;E', 'Corticosteroids cause weight gain, not loss.'],
  ['CLIN', 'Which drugs commonly require therapeutic drug monitoring?', 'Lithium', 'Vancomycin', 'Paracetamol', 'Phenytoin', 'Theophylline', 'A;B;D;E', 'Paracetamol is not routinely monitored therapeutically.'],
  ['MICRO', 'Which are methods of sterilization?', 'Autoclaving', 'Gamma irradiation', 'Refrigeration', 'Dry heat', 'Ethylene oxide gas', 'A;B;D;E', 'Refrigeration only slows growth; it does not sterilize.'],
  ['BIOC', 'Which are fat-soluble vitamins?', 'Vitamin A', 'Vitamin D', 'Vitamin C', 'Vitamin E', 'Vitamin K', 'A;B;D;E', 'Vitamin C is water-soluble.'],
  ['PHYS', 'Which hormones are secreted by the anterior pituitary?', 'Growth hormone', 'TSH', 'Oxytocin', 'ACTH', 'Prolactin', 'A;B;D;E', 'Oxytocin is released by the posterior pituitary.'],
  ['TOX', 'Which are heavy-metal chelating antidotes?', 'Dimercaprol (BAL)', 'EDTA (calcium disodium)', 'Naloxone', 'Penicillamine', 'Desferrioxamine', 'A;B;D;E', 'Naloxone is an opioid antagonist, not a chelator.'],
  ['PHCOL', 'Which are non-selective beta-blockers?', 'Propranolol', 'Atenolol', 'Timolol', 'Metoprolol', 'Nadolol', 'A;C;E', 'Atenolol and metoprolol are beta-1 selective.'],
  ['MCHEM', 'Which drugs are statins (HMG-CoA reductase inhibitors)?', 'Atorvastatin', 'Simvastatin', 'Gemfibrozil', 'Rosuvastatin', 'Ezetimibe', 'A;B;D', 'Gemfibrozil is a fibrate; ezetimibe blocks cholesterol absorption.'],
  ['PHTCS', 'Which are official tablet quality-control tests?', 'Hardness', 'Friability', 'Disintegration', 'Optical rotation', 'Dissolution', 'A;B;C;E', 'Optical rotation is not a tablet QC test.'],
  ['PHCOL', 'Which drugs are selective serotonin reuptake inhibitors (SSRIs)?', 'Fluoxetine', 'Sertraline', 'Amitriptyline', 'Escitalopram', 'Imipramine', 'A;B;D', 'Amitriptyline and imipramine are tricyclics.'],
  ['BIOC', 'Which enzymes participate in the urea cycle?', 'Carbamoyl phosphate synthetase I', 'Ornithine transcarbamylase', 'Hexokinase', 'Argininosuccinate synthetase', 'Arginase', 'A;B;D;E', 'Hexokinase is in glycolysis, not the urea cycle.'],
  ['MICRO', 'Which stains/agents are used in the Gram stain procedure?', 'Crystal violet', 'Iodine (mordant)', 'Alcohol (decolorizer)', 'Safranin (counterstain)', 'Eosin', 'A;B;C;D', 'Eosin is used in H&E, not Gram staining.'],
  ['CLIN', 'Which are recognised signs of digoxin toxicity?', 'Nausea/vomiting', 'Visual disturbances (yellow vision)', 'Arrhythmias', 'Hyperglycaemia', 'Confusion', 'A;B;C;E', 'Digoxin toxicity is not characterised by hyperglycaemia.'],
  ['PHGNY', 'Which are alkaloids?', 'Morphine', 'Atropine', 'Sennoside', 'Quinine', 'Nicotine', 'A;B;D;E', 'Sennoside is an anthraquinone glycoside.'],
  ['PK', 'Which parameters describe drug elimination?', 'Clearance', 'Half-life', 'Elimination rate constant', 'Tmax', 'Cmax', 'A;B;C', 'Tmax and Cmax describe absorption/peak exposure.'],
  ['PHYS', 'Which are formed elements of blood?', 'Erythrocytes', 'Leukocytes', 'Platelets', 'Albumin', 'Fibrinogen', 'A;B;C', 'Albumin and fibrinogen are plasma proteins.'],
  ['PHCOL', 'Which drugs are used in type 2 diabetes?', 'Metformin', 'Glibenclamide', 'Sitagliptin', 'Levothyroxine', 'Empagliflozin', 'A;B;C;E', 'Levothyroxine treats hypothyroidism.'],
  ['MCHEM', 'Which are tetracycline antibiotics?', 'Doxycycline', 'Minocycline', 'Azithromycin', 'Tetracycline', 'Linezolid', 'A;B;D', 'Azithromycin is a macrolide; linezolid is an oxazolidinone.'],
  ['JURIS', 'Which schedules of the Drugs and Cosmetics Rules concern prescription/controlled sale?', 'Schedule H', 'Schedule H1', 'Schedule X', 'Schedule M', 'Schedule N', 'A;B;C', 'Schedule M is GMP; Schedule N is pharmacy equipment.'],
  ['CLIN', 'Which counselling points apply to inhaled corticosteroids?', 'Rinse mouth after use', 'Use a spacer if needed', 'Expect immediate bronchodilation', 'Use regularly for control', 'Carry as a rescue inhaler', 'A;B;D', 'ICS are preventers, not rescue/relievers, and act over time.'],
];

// ── ASSERTION_REASON: [subj, assertion, reason, correctLetter] (fixed A-D options) ───────────────
const AR_OPTS = [
  'Both A and R are true and R is the correct explanation of A',
  'Both A and R are true but R is NOT the correct explanation of A',
  'A is true but R is false',
  'A is false but R is true',
];
const AR = [
  ['PHCOL', 'Aspirin is used in low doses for cardioprotection.', 'Aspirin irreversibly acetylates platelet COX-1, reducing thromboxane A2.', 'A'],
  ['PHCOL', 'Non-selective beta-blockers are used cautiously in asthmatics.', 'Beta-2 blockade can precipitate bronchoconstriction.', 'A'],
  ['PHCOL', 'ACE inhibitors can cause a dry cough.', 'ACE inhibitors increase bradykinin levels.', 'A'],
  ['MCHEM', 'Penicillins are bactericidal.', 'Penicillins inhibit bacterial protein synthesis at the 30S subunit.', 'C'],
  ['PHTCS', 'Magnesium stearate is added to tablet formulations.', 'Magnesium stearate acts as a lubricant to reduce die-wall friction.', 'A'],
  ['PHTCS', 'Suspensions should be shaken before use.', 'Suspensions are thermodynamically stable solutions.', 'C'],
  ['PHGNY', 'Digitalis is used in heart failure.', 'Digitalis contains cardiac glycosides that inhibit Na-K ATPase.', 'A'],
  ['PK', 'A drug with high first-pass metabolism has low oral bioavailability.', 'First-pass metabolism occurs in the liver before systemic circulation.', 'A'],
  ['PK', 'Zero-order kinetics implies a constant fraction of drug is eliminated per unit time.', 'In zero-order kinetics elimination pathways are saturated.', 'D'],
  ['CLIN', 'Pyridoxine is given with isoniazid.', 'Isoniazid can induce peripheral neuropathy via vitamin B6 depletion.', 'A'],
  ['MICRO', 'Autoclaving is used for heat-stable items.', 'Autoclaving uses saturated steam under pressure at 121 C.', 'A'],
  ['BIOC', 'Statins lower cholesterol.', 'Statins inhibit HMG-CoA reductase, the rate-limiting step of cholesterol synthesis.', 'A'],
  ['PHYS', 'Insulin lowers blood glucose.', 'Insulin promotes glucose uptake via GLUT-4 in muscle and adipose tissue.', 'A'],
  ['TOX', 'Atropine is used in organophosphate poisoning.', 'Atropine reactivates acetylcholinesterase enzyme.', 'C'],
  ['PHCOL', 'Morphine can cause respiratory depression.', 'Morphine stimulates the respiratory centre in the medulla.', 'C'],
  ['PHCOL', 'Loop diuretics can cause hypokalaemia.', 'Increased sodium delivery to the distal tubule enhances potassium excretion.', 'A'],
  ['MCHEM', 'Sulfonamides are bacteriostatic.', 'Sulfonamides competitively inhibit dihydropteroate synthase in folate synthesis.', 'A'],
  ['PHTCS', 'Enteric coating protects acid-labile drugs.', 'Enteric polymers dissolve at the higher pH of the small intestine.', 'A'],
  ['ANAL', 'A blank is run in spectrophotometry.', 'The blank corrects for absorbance by the solvent and cuvette.', 'A'],
  ['CLIN', 'Warfarin requires INR monitoring.', 'Warfarin has a narrow therapeutic index and many interactions.', 'A'],
  ['PHGNY', 'Vinca alkaloids are used in cancer chemotherapy.', 'Vinca alkaloids inhibit microtubule assembly during mitosis.', 'A'],
  ['PHYS', 'The posterior pituitary releases oxytocin.', 'Oxytocin is synthesized in the hypothalamus and stored in the posterior pituitary.', 'A'],
  ['BIOC', 'Vitamin C deficiency causes scurvy.', 'Vitamin C is required for collagen hydroxylation.', 'A'],
  ['PK', 'Plasma protein binding reduces the free fraction of a drug.', 'Only unbound drug is pharmacologically active and can be eliminated.', 'A'],
  ['MICRO', 'HEPA filters are used in sterile manufacturing areas.', 'HEPA filters remove 99.97% of particles 0.3 micron in size.', 'A'],
  ['PHCOL', 'Calcium channel blockers reduce blood pressure.', 'They block L-type calcium channels causing vasodilation.', 'A'],
  ['TOX', 'Activated charcoal is used in acute oral poisoning.', 'Activated charcoal adsorbs many toxins in the GI tract.', 'A'],
  ['JURIS', 'Schedule X drugs require special record-keeping.', 'Schedule X includes certain narcotic and psychotropic substances.', 'A'],
  ['CLIN', 'Beta-blockers are stopped abruptly without risk.', 'Abrupt withdrawal of beta-blockers can cause rebound tachycardia and ischaemia.', 'D'],
  ['PHTCS', 'Lyophilization improves the stability of labile injectables.', 'Freeze-drying removes water by sublimation under vacuum.', 'A'],
];

// ── TRUE_FALSE: [subj, statement, 'true'|'false'] ────────────────────────────────────────────────
const TF = [
  ['PHCOL', 'Adrenaline is the first-line drug for anaphylaxis.', 'true'],
  ['PHCOL', 'Beta-2 agonists cause bronchoconstriction.', 'false'],
  ['PHCOL', 'Atropine is a muscarinic antagonist.', 'true'],
  ['PHCOL', 'Heparin can be given orally for anticoagulation.', 'false'],
  ['MCHEM', 'Cephalosporins contain a beta-lactam ring.', 'true'],
  ['MCHEM', 'Macrolides act on the bacterial 50S ribosomal subunit.', 'true'],
  ['PHTCS', 'Magnesium stearate is a tablet disintegrant.', 'false'],
  ['PHTCS', 'Cocoa butter is a water-soluble suppository base.', 'false'],
  ['PHTCS', 'Emulsions are biphasic systems of two immiscible liquids.', 'true'],
  ['PHGNY', 'Morphine is the principal alkaloid of opium.', 'true'],
  ['PHGNY', 'Quinine is obtained from Cinchona bark.', 'true'],
  ['ANAL', 'Karl Fischer titration determines water content.', 'true'],
  ['ANAL', 'In reverse-phase HPLC the stationary phase is polar.', 'false'],
  ['PK', 'Intravenous drugs have 100% bioavailability.', 'true'],
  ['PK', 'In first-order kinetics a constant fraction of drug is eliminated per unit time.', 'true'],
  ['CLIN', 'ACE inhibitors commonly cause a dry cough.', 'true'],
  ['CLIN', 'Vitamin K is the antidote for heparin overdose.', 'false'],
  ['MICRO', 'Gram-positive bacteria stain purple/violet.', 'true'],
  ['MICRO', 'Autoclaving uses dry heat.', 'false'],
  ['BIOC', 'HMG-CoA reductase is the target of statins.', 'true'],
  ['BIOC', 'Vitamin C is a fat-soluble vitamin.', 'false'],
  ['PHYS', 'Insulin is secreted by the beta cells of the pancreas.', 'true'],
  ['PHYS', 'The nephron is the functional unit of the liver.', 'false'],
  ['TOX', 'N-acetylcysteine is the antidote for paracetamol overdose.', 'true'],
  ['TOX', 'Naloxone reverses benzodiazepine overdose.', 'false'],
  ['PHCOL', 'Furosemide acts on the thick ascending limb of the loop of Henle.', 'true'],
  ['PHCOL', 'Omeprazole is an H2-receptor antagonist.', 'false'],
  ['JURIS', 'Schedule H drugs can be sold without a prescription.', 'false'],
  ['CLIN', 'Digoxin has a narrow therapeutic index.', 'true'],
  ['PHTCS', 'A high HLB surfactant favours oil-in-water emulsions.', 'true'],
];

// ── NUMERIC: [subj, text, value, tolerance, explanation] ─────────────────────────────────────────
const NUM = [
  ['PK', 'If a drug has a half-life of 8 hours, how many hours until ~93.75% is eliminated (4 half-lives)?', '32', '0', '4 half-lives = 4 x 8 = 32 hours.'],
  ['PK', 'A drug given as 500 mg with 80% oral bioavailability delivers how many mg systemically?', '400', '0', '500 x 0.80 = 400 mg.'],
  ['PK', 'Half-life given Vd = 50 L and clearance = 5 L/h. t1/2 = 0.693 x Vd / CL (hours)?', '6.93', '0.1', 't1/2 = 0.693 x 50 / 5 = 6.93 h.'],
  ['PK', 'Loading dose for target 10 mg/L and Vd 40 L (mg), bioavailability 100%?', '400', '0', 'LD = Cp x Vd = 10 x 40 = 400 mg.'],
  ['PK', 'After how many half-lives is steady state essentially reached (>=97%)?', '5', '0', 'About 5 half-lives gives ~97% of steady state.'],
  ['PHTCS', 'How many 250 mg tablets provide a 1 g (1000 mg) dose?', '4', '0', '1000 / 250 = 4 tablets.'],
  ['PHTCS', 'What volume (mL) of a 2% w/v solution contains 100 mg of drug?', '5', '0', '2% w/v = 20 mg/mL; 100 / 20 = 5 mL.'],
  ['PHTCS', 'A 1:1000 adrenaline solution contains how many mg per mL?', '1', '0', '1:1000 = 1 g per 1000 mL = 1 mg/mL.'],
  ['PHTCS', 'How many grams of drug are in 500 mL of a 5% w/v solution?', '25', '0', '5% w/v = 5 g/100 mL; 500 mL -> 25 g.'],
  ['PHTCS', 'To make 200 mL of 0.9% w/v saline, how many grams of NaCl are needed?', '1.8', '0.01', '0.9 g/100 mL x 200 mL = 1.8 g.'],
  ['ANAL', 'In Beer-Lambert law A = e c l, if e=2000, c=0.0001 M, l=1 cm, find A.', '0.2', '0.001', 'A = 2000 x 0.0001 x 1 = 0.2.'],
  ['ANAL', 'A sample shows %transmittance of 10%. What is its absorbance (A = 2 - log %T)?', '1', '0', 'A = 2 - log(10) = 2 - 1 = 1.'],
  ['CLIN', 'A paediatric dose is 15 mg/kg for a 20 kg child. Total dose (mg)?', '300', '0', '15 x 20 = 300 mg.'],
  ['CLIN', 'Infusion at 2 mg/min for 60 minutes delivers how many mg?', '120', '0', '2 x 60 = 120 mg.'],
  ['CLIN', 'A 5 mg/mL solution: what volume (mL) gives a 12.5 mg dose?', '2.5', '0', '12.5 / 5 = 2.5 mL.'],
  ['BIOC', 'Net ATP yield from one molecule of glucose in glycolysis (substrate-level)?', '2', '0', 'Glycolysis yields a net 2 ATP.'],
  ['BIOC', 'How many carbon atoms are in one molecule of glucose?', '6', '0', 'Glucose is C6H12O6.'],
  ['PHYS', 'Approximate normal adult resting heart rate upper limit (bpm)?', '100', '0', 'Normal adult resting heart rate is 60-100 bpm.'],
  ['PHYS', 'Number of pairs of chromosomes in a normal human somatic cell?', '23', '0', 'Humans have 23 pairs (46 chromosomes).'],
  ['PK', 'A drug is 90% protein bound. What percent is free?', '10', '0', '100 - 90 = 10% free.'],
  ['PHTCS', 'Dilution: how many mL of water to dilute 50 mL of 10% solution to 5%? (final - initial)', '50', '0', 'C1V1=C2V2 -> 10x50=5xV2 -> V2=100 mL; add 50 mL.'],
  ['ANAL', 'Molarity of a solution with 0.5 mol solute in 2 L (mol/L)?', '0.25', '0', '0.5 / 2 = 0.25 M.'],
  ['CLIN', 'Drops/min for 1000 mL over 8 h with a 15 drops/mL set (approx)?', '31', '1', '(1000 x 15) / (8 x 60) = 31.25 ~ 31 gtt/min.'],
  ['PK', 'Clearance if dosing rate 20 mg/h maintains Css 4 mg/L (L/h)?', '5', '0', 'CL = dosing rate / Css = 20 / 4 = 5 L/h.'],
  ['PHTCS', 'How many 5 mL doses are in a 150 mL bottle?', '30', '0', '150 / 5 = 30 doses.'],
  ['BIOC', 'pH of a solution with [H+] = 1 x 10^-7 M?', '7', '0', 'pH = -log(1e-7) = 7.'],
  ['CLIN', 'A 0.25 mg tablet: how many tablets for a 1 mg dose?', '4', '0', '1 / 0.25 = 4 tablets.'],
  ['PK', 'If 100 mg is given and Vd is 25 L, initial plasma conc (mg/L)?', '4', '0', 'C0 = dose / Vd = 100 / 25 = 4 mg/L.'],
  ['ANAL', 'Percentage label claim if assay finds 98 mg in a 100 mg tablet?', '98', '0', '(98/100) x 100 = 98%.'],
  ['PHTCS', 'How many micrograms are in 0.5 mg?', '500', '0', '0.5 mg x 1000 = 500 micrograms.'],
];

// ── MATCHING: [subj, text, pairs[[left,right]...]] ───────────────────────────────────────────────
const MATCH = [
  ['PHCOL', 'Match each drug to its pharmacological class.', [['Atenolol', 'Beta-blocker'], ['Amlodipine', 'Calcium channel blocker'], ['Losartan', 'ARB'], ['Furosemide', 'Loop diuretic']]],
  ['PHCOL', 'Match the antidiabetic drug to its class.', [['Metformin', 'Biguanide'], ['Glibenclamide', 'Sulfonylurea'], ['Sitagliptin', 'DPP-4 inhibitor'], ['Empagliflozin', 'SGLT2 inhibitor']]],
  ['MCHEM', 'Match each antibiotic to its class.', [['Amoxicillin', 'Penicillin'], ['Azithromycin', 'Macrolide'], ['Ciprofloxacin', 'Fluoroquinolone'], ['Gentamicin', 'Aminoglycoside']]],
  ['MCHEM', 'Match the drug suffix to its class.', [['-prazole', 'Proton pump inhibitor'], ['-sartan', 'ARB'], ['-statin', 'HMG-CoA reductase inhibitor'], ['-dipine', 'Calcium channel blocker']]],
  ['PHGNY', 'Match the alkaloid to its plant source.', [['Morphine', 'Papaver somniferum'], ['Quinine', 'Cinchona'], ['Reserpine', 'Rauwolfia'], ['Atropine', 'Atropa belladonna']]],
  ['PHGNY', 'Match the natural product to its pharmacological use.', [['Digoxin', 'Heart failure'], ['Vincristine', 'Anticancer'], ['Senna', 'Laxative'], ['Ephedrine', 'Decongestant']]],
  ['PHTCS', 'Match the excipient to its function.', [['Starch', 'Disintegrant'], ['Magnesium stearate', 'Lubricant'], ['Lactose', 'Diluent'], ['Talc', 'Glidant']]],
  ['PHTCS', 'Match the dosage form to its description.', [['Emulsion', 'Two immiscible liquids'], ['Suspension', 'Solid dispersed in liquid'], ['Suppository', 'Solid for body cavity'], ['Aerosol', 'Pressurised dosage form']]],
  ['ANAL', 'Match the technique to what it measures.', [['UV spectroscopy', 'Light absorption'], ['HPLC', 'Separation'], ['Karl Fischer', 'Water content'], ['Potentiometry', 'Electrode potential']]],
  ['TOX', 'Match the poison to its antidote.', [['Paracetamol', 'N-acetylcysteine'], ['Opioids', 'Naloxone'], ['Organophosphates', 'Atropine'], ['Iron', 'Desferrioxamine']]],
  ['PHCOL', 'Match each drug to its target receptor/enzyme.', [['Salbutamol', 'Beta-2 receptor'], ['Omeprazole', 'H+/K+ ATPase'], ['Aspirin', 'Cyclooxygenase'], ['Clopidogrel', 'P2Y12 receptor']]],
  ['BIOC', 'Match the vitamin to its deficiency disease.', [['Vitamin C', 'Scurvy'], ['Vitamin D', 'Rickets'], ['Vitamin B1', 'Beriberi'], ['Vitamin A', 'Night blindness']]],
  ['PHYS', 'Match the hormone to its gland.', [['Insulin', 'Pancreas'], ['Thyroxine', 'Thyroid'], ['Cortisol', 'Adrenal cortex'], ['Growth hormone', 'Anterior pituitary']]],
  ['MICRO', 'Match the sterilization method to its agent.', [['Autoclave', 'Moist heat'], ['Hot air oven', 'Dry heat'], ['Membrane filter', 'Filtration'], ['Gamma rays', 'Ionizing radiation']]],
  ['PK', 'Match the PK parameter to its meaning.', [['Cmax', 'Peak concentration'], ['Tmax', 'Time of peak'], ['AUC', 'Total exposure'], ['t1/2', 'Half-life']]],
  ['PHCOL', 'Match the diuretic to its site of action.', [['Furosemide', 'Loop of Henle'], ['Hydrochlorothiazide', 'Distal convoluted tubule'], ['Spironolactone', 'Collecting duct'], ['Acetazolamide', 'Proximal tubule']]],
  ['MCHEM', 'Match the antihypertensive class to an example.', [['ACE inhibitor', 'Enalapril'], ['ARB', 'Valsartan'], ['Beta-blocker', 'Metoprolol'], ['CCB', 'Nifedipine']]],
  ['CLIN', 'Match the drug to a key monitoring parameter.', [['Warfarin', 'INR'], ['Digoxin', 'Serum level'], ['Aminoglycosides', 'Renal function'], ['Statins', 'Liver enzymes']]],
  ['PHGNY', 'Match the glycoside class to an example.', [['Cardiac glycoside', 'Digoxin'], ['Anthraquinone glycoside', 'Sennoside'], ['Cyanogenic glycoside', 'Amygdalin'], ['Saponin glycoside', 'Glycyrrhizin']]],
  ['PHTCS', 'Match the route to its absorption feature.', [['Intravenous', 'No absorption phase'], ['Sublingual', 'Avoids first pass'], ['Oral', 'First-pass metabolism'], ['Transdermal', 'Sustained delivery']]],
  ['PHCOL', 'Match the opioid to its property.', [['Morphine', 'Strong agonist'], ['Codeine', 'Weak agonist'], ['Naloxone', 'Antagonist'], ['Buprenorphine', 'Partial agonist']]],
  ['BIOC', 'Match the biomolecule to its monomer.', [['Protein', 'Amino acid'], ['Starch', 'Glucose'], ['DNA', 'Nucleotide'], ['Triglyceride', 'Fatty acid']]],
  ['PHYS', 'Match the blood cell to its function.', [['Erythrocyte', 'Oxygen transport'], ['Neutrophil', 'Phagocytosis'], ['Platelet', 'Clotting'], ['Lymphocyte', 'Immunity']]],
  ['MICRO', 'Match the organism to its shape.', [['Coccus', 'Spherical'], ['Bacillus', 'Rod'], ['Spirillum', 'Spiral'], ['Vibrio', 'Comma-shaped']]],
  ['ANAL', 'Match the titration to its type.', [['Acid-base', 'Neutralisation'], ['Karl Fischer', 'Water'], ['Iodometry', 'Redox'], ['Complexometric', 'EDTA']]],
  ['CLIN', 'Match the adverse effect to its drug.', [['Dry cough', 'ACE inhibitor'], ['Gingival hyperplasia', 'Phenytoin'], ['Ototoxicity', 'Aminoglycoside'], ['Hypokalaemia', 'Loop diuretic']]],
  ['TOX', 'Match the chelator to its metal.', [['Desferrioxamine', 'Iron'], ['Dimercaprol', 'Arsenic'], ['Penicillamine', 'Copper'], ['EDTA', 'Lead']]],
  ['PHCOL', 'Match the autonomic drug to its action.', [['Atropine', 'Antimuscarinic'], ['Pilocarpine', 'Muscarinic agonist'], ['Propranolol', 'Beta-blocker'], ['Phenylephrine', 'Alpha-1 agonist']]],
  ['JURIS', 'Match the schedule to its content (D and C Rules).', [['Schedule H', 'Prescription drugs'], ['Schedule X', 'Narcotic/psychotropic'], ['Schedule M', 'GMP'], ['Schedule Y', 'Clinical trials']]],
  ['PHTCS', 'Match the QC test to the dosage form/property.', [['Friability', 'Tablets'], ['Disintegration', 'Tablets/capsules'], ['Clarity', 'Parenterals'], ['Viscosity', 'Liquids']]],
];

function tail(subj, i, extraTags) {
  const s = S[subj];
  return {
    knowledgeCodes: s.k, examCodes: exam(i), curriculumNodes: s.c, trackModules: s.t,
    tags: extraTags ? `${s.g};${extraTags}` : s.g, mediaType: '', mediaUrl: '', mediaAltText: '',
  };
}
function head(code, i, text, explanation) {
  return { questionCode: code, difficulty: diff(i), language: 'en', questionText: text, explanation: explanation || '' };
}
const pad = (n) => String(n + 1).padStart(3, '0');

const SHEETS = [
  { name: 'SINGLE_CHOICE', columns: [...HEAD, ...CHOICE, ...TAIL], rows: SINGLE.map((q, i) => ({ ...head(`PH2-SC-${pad(i)}`, i, q[1], q[7]), optionA: q[2], optionB: q[3], optionC: q[4], optionD: q[5], optionE: '', optionF: '', correct: q[6], ...tail(q[0], i) })) },
  { name: 'MULTI_CHOICE', columns: [...HEAD, ...CHOICE, ...TAIL], rows: MULTI.map((q, i) => ({ ...head(`PH2-MC-${pad(i)}`, i, q[1], q[8]), optionA: q[2], optionB: q[3], optionC: q[4], optionD: q[5], optionE: q[6], optionF: '', correct: q[7], ...tail(q[0], i) })) },
  { name: 'ASSERTION_REASON', columns: [...HEAD, ...CHOICE, ...TAIL], rows: AR.map((q, i) => ({ ...head(`PH2-AR-${pad(i)}`, i, `Assertion (A): ${q[1]}  Reason (R): ${q[2]}`, ''), optionA: AR_OPTS[0], optionB: AR_OPTS[1], optionC: AR_OPTS[2], optionD: AR_OPTS[3], optionE: '', optionF: '', correct: q[3], ...tail(q[0], i, 'assertion-reason') })) },
  { name: 'TRUE_FALSE', columns: [...HEAD, 'trueFalseAnswer', ...TAIL], rows: TF.map((q, i) => ({ ...head(`PH2-TF-${pad(i)}`, i, q[1], ''), trueFalseAnswer: q[2], ...tail(q[0], i) })) },
  { name: 'NUMERIC', columns: [...HEAD, 'numericValue', 'numericTolerance', ...TAIL], rows: NUM.map((q, i) => ({ ...head(`PH2-NU-${pad(i)}`, i, q[1], q[4]), numericValue: q[2], numericTolerance: q[3], ...tail(q[0], i) })) },
  { name: 'MATCHING', columns: [...HEAD, 'matchingPairs', ...TAIL], rows: MATCH.map((q, i) => ({ ...head(`PH2-MA-${pad(i)}`, i, q[1], ''), matchingPairs: q[2].map(([l, r]) => `${l}=${r}`).join(';'), ...tail(q[0], i) })) },
];

const READ_ME = [
  'Pharmacy question bank (v2) for the platform import (admin -> Questions -> Import). One sheet per question type.',
  'Upload this whole .xlsx in the Import page. All known type sheets are read automatically; delete any sheet you do not want (it is skipped).',
  'Do NOT rename the type sheets - the sheet name selects the question type. READ_ME and MAPPING_CODES are ignored on import.',
  'Every question imports as DRAFT, owned by your organization, then follows the normal review/publish workflow.',
  'questionCode uses the PH2-<TYPE>-NNN scheme (distinct from the older PHM-* set) so it will not clash.',
  'tags always apply. knowledgeCodes / examCodes / curriculumNodes / trackModules only attach if those items already exist (matched by code) - see MAPPING_CODES.',
  'Choice answers: SINGLE_CHOICE / ASSERTION_REASON have exactly one correct letter; MULTI_CHOICE lists several (e.g. A;C;D).',
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pharmacy MCQ Platform';
  const info = wb.addWorksheet('READ_ME');
  info.columns = [{ header: 'How to use this workbook', key: 'a', width: 120 }];
  info.getRow(1).font = { bold: true };
  READ_ME.forEach((l) => info.addRow([l]));
  info.getColumn(1).alignment = { wrapText: true };

  let total = 0;
  for (const sh of SHEETS) {
    const ws = wb.addWorksheet(sh.name);
    ws.columns = sh.columns.map((c) => ({ header: c, key: c, width: Math.min(46, Math.max(12, c.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of sh.rows) ws.addRow(sh.columns.map((c) => r[c] ?? ''));
    total += sh.rows.length;
  }

  const ref = wb.addWorksheet('MAPPING_CODES');
  ref.columns = [{ header: 'type', key: 't', width: 16 }, { header: 'code / path used in this file', key: 'c', width: 48 }, { header: 'note', key: 'n', width: 60 }];
  ref.getRow(1).font = { bold: true };
  const knowledge = new Set(), exams = new Set(), currNodes = new Set(), trackMods = new Set();
  for (const sh of SHEETS) for (const r of sh.rows) {
    (r.knowledgeCodes || '').split(';').forEach((x) => x && knowledge.add(x.trim()));
    (r.examCodes || '').split(';').forEach((x) => x && exams.add(x.trim()));
    (r.curriculumNodes || '').split(';').forEach((x) => x && currNodes.add(x.trim()));
    (r.trackModules || '').split(';').forEach((x) => x && trackMods.add(x.trim()));
  }
  [...knowledge].sort().forEach((c) => ref.addRow({ t: 'knowledge', c, n: c === 'DEMO-PHARMA' ? 'exists from the demo seeder' : 'create a Knowledge node with this code' }));
  [...exams].sort().forEach((c) => ref.addRow({ t: 'exam', c, n: 'create an Exam profile with this code' }));
  [...currNodes].sort().forEach((c) => ref.addRow({ t: 'curriculum', c, n: 'CURRICULUM_CODE>NODE - create the curriculum + node' }));
  [...trackMods].sort().forEach((c) => ref.addRow({ t: 'track', c, n: 'TRACK_CODE>MODULE - create the track + module' }));

  const out = path.join(__dirname, '..', 'pharmacy-questions-v2.xlsx');
  await wb.xlsx.writeFile(out);
  console.log(`Wrote ${out}`);
  console.log(`Sheets: ${SHEETS.map((s) => `${s.name}(${s.rows.length})`).join(', ')}  | total: ${total}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
