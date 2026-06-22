// Generates a ready-to-upload multi-sheet question workbook (same format as the import template),
// with 30+ pharmacy questions per type across all major subjects. Run from repo root:
//   NODE_PATH="apps/web/node_modules" node scripts/generate-question-workbook.cjs
const ExcelJS = require('exceljs');
const path = require('path');

// ── Subject taxonomy → mapping columns. DEMO-PHARMA is the one knowledge node the seeder creates,
//    so it resolves today; the rest are an illustrative taxonomy (see the MAPPING_CODES sheet). ──
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
const exam = (i) => (i % 3 === 2 ? 'GPAT;NIPER' : 'GPAT');

// ── Question banks (subjKey, ...fields) ─────────────────────────────────────────────────────────
// SINGLE_CHOICE: [subj, text, A, B, C, D, correctLetter, explanation]
const SINGLE = [
  ['PHCOL', 'Which drug is the first choice in the management of acute anaphylaxis?', 'Adrenaline (epinephrine)', 'Atropine', 'Dopamine', 'Dobutamine', 'A', 'Intramuscular adrenaline is first-line for anaphylaxis.'],
  ['PHCOL', 'Which beta-blocker is cardioselective (beta-1 selective)?', 'Propranolol', 'Atenolol', 'Timolol', 'Nadolol', 'B', 'Atenolol is beta-1 selective; the others are non-selective.'],
  ['MCHEM', 'Sulfonamides exert antibacterial action by inhibiting which enzyme?', 'DNA gyrase', 'Dihydropteroate synthase', 'Transpeptidase', '30S ribosomal subunit', 'B', 'Sulfonamides block dihydropteroate synthase in folate synthesis.'],
  ['PHTCS', 'Cocoa butter, a classic suppository base, is classified as:', 'Water-soluble', 'Oleaginous (fatty)', 'Emulsifying', 'Hydrogel', 'B', 'Cocoa butter (theobroma oil) is an oleaginous base.'],
  ['PHGNY', 'Quinine is obtained from the bark of:', 'Cinchona', 'Rauwolfia', 'Digitalis', 'Atropa belladonna', 'A', 'Quinine is an alkaloid from Cinchona bark.'],
  ['ANAL', 'The Beer-Lambert law relates absorbance to:', 'Temperature', 'Concentration', 'pH', 'Viscosity', 'B', 'Absorbance is proportional to concentration and path length.'],
  ['PK', 'Elimination of a constant amount of drug per unit time is characteristic of:', 'First-order kinetics', 'Zero-order kinetics', 'Michaelis-Menten at low dose', 'Flip-flop kinetics', 'B', 'Zero-order eliminates a constant amount per time (saturated).'],
  ['CLIN', 'The specific antidote for warfarin over-anticoagulation is:', 'Vitamin K', 'Protamine sulfate', 'N-acetylcysteine', 'Naloxone', 'A', 'Vitamin K reverses warfarin; protamine reverses heparin.'],
  ['MICRO', 'After Gram staining, Gram-positive bacteria appear:', 'Pink', 'Purple/violet', 'Green', 'Colourless', 'B', 'Gram-positives retain crystal violet and appear purple.'],
  ['BIOC', 'The rate-limiting enzyme of cholesterol biosynthesis is:', 'HMG-CoA reductase', 'Squalene synthase', 'Acetyl-CoA carboxylase', 'Citrate lyase', 'A', 'HMG-CoA reductase is rate-limiting and the statin target.'],
  ['PHYS', 'Insulin is secreted by which pancreatic islet cells?', 'Alpha cells', 'Beta cells', 'Delta cells', 'Acinar cells', 'B', 'Beta cells of the islets of Langerhans secrete insulin.'],
  ['TOX', 'The antidotal combination for organophosphate poisoning is:', 'Atropine + pralidoxime', 'Naloxone', 'Flumazenil', 'Vitamin K', 'A', 'Atropine blocks muscarinic effects; pralidoxime reactivates cholinesterase.'],
  ['JURIS', 'In India, the symbol Rx on a drug label indicates the product is:', 'Over-the-counter', 'Prescription-only', 'Ayurvedic', 'A cosmetic', 'B', 'Rx denotes a prescription-only medicine.'],
  ['PHCOL', 'Loop diuretics such as furosemide act mainly on the:', 'Proximal convoluted tubule', 'Thick ascending limb of the loop of Henle', 'Distal convoluted tubule', 'Collecting duct', 'B', 'Loop diuretics inhibit the Na-K-2Cl cotransporter in the thick ascending limb.'],
  ['MCHEM', 'The core ring system of penicillins is the:', 'Beta-lactam ring', 'Macrolide ring', 'Tetracycline ring', 'Quinolone ring', 'A', 'Penicillins are beta-lactam antibiotics.'],
  ['PHTCS', 'An emulsifier with a high HLB value (above 10) is best suited for:', 'Water-in-oil emulsions', 'Oil-in-water emulsions', 'Antifoaming', 'Lubrication', 'B', 'High HLB favours oil-in-water emulsions.'],
  ['PHGNY', 'The principal active constituent of opium is:', 'Morphine', 'Reserpine', 'Quinine', 'Atropine', 'A', 'Morphine is the chief alkaloid of opium.'],
  ['ANAL', 'Karl Fischer titration is used to determine:', 'Water content', 'Assay of acids', 'pH', 'Total ash', 'A', 'Karl Fischer titration quantifies water (moisture).'],
  ['PK', 'Which plasma protein primarily binds acidic drugs?', 'Albumin', 'Alpha-1 acid glycoprotein', 'Gamma globulin', 'Fibrinogen', 'A', 'Albumin binds acidic drugs; AAG binds basic drugs.'],
  ['CLIN', 'Which drug most clearly requires therapeutic drug monitoring (narrow index)?', 'Digoxin', 'Paracetamol', 'Amoxicillin', 'Cetirizine', 'A', 'Digoxin has a narrow therapeutic index requiring TDM.'],
  ['PHCOL', 'A selective COX-2 inhibitor among the following is:', 'Celecoxib', 'Aspirin', 'Ibuprofen', 'Naproxen', 'A', 'Celecoxib selectively inhibits COX-2.'],
  ['MICRO', 'Autoclaving achieves sterilization by:', 'Dry heat', 'Moist heat under pressure', 'Ionizing radiation', 'Membrane filtration', 'B', 'Autoclaves use saturated steam under pressure (typically 121 C).'],
  ['BIOC', 'Ascorbic acid is the chemical name of:', 'Vitamin C', 'Vitamin A', 'Vitamin E', 'Vitamin D', 'A', 'Vitamin C is ascorbic acid.'],
  ['PHYS', 'The normal fasting blood glucose range (mg/dL) in adults is:', '70-100', '140-180', '200-250', '40-60', 'A', 'Normal fasting glucose is about 70-100 mg/dL.'],
  ['TOX', 'The specific antidote for paracetamol (acetaminophen) overdose is:', 'N-acetylcysteine', 'Naloxone', 'Atropine', 'Deferoxamine', 'A', 'N-acetylcysteine replenishes hepatic glutathione.'],
  ['PHCOL', 'The drug of choice for immediate control of status epilepticus is an intravenous:', 'Benzodiazepine (lorazepam/diazepam)', 'Carbamazepine', 'Valproate tablet', 'Ethosuximide', 'A', 'IV benzodiazepines are first-line for status epilepticus.'],
  ['MCHEM', 'Proton pump inhibitors characteristically carry the suffix:', '-prazole', '-tidine', '-dipine', '-sartan', 'A', 'Omeprazole, pantoprazole, etc. share the -prazole suffix.'],
  ['CLIN', 'A characteristic adverse effect of ACE inhibitors is:', 'Dry cough', 'Constipation', 'Bradycardia', 'Hypoglycaemia', 'A', 'ACE inhibitors raise bradykinin causing a dry cough.'],
  ['PHTCS', 'Which excipient is commonly used as a tablet disintegrant?', 'Starch', 'Magnesium stearate', 'Talc', 'Liquid paraffin', 'A', 'Starch is a classic disintegrant; magnesium stearate is a lubricant.'],
  ['PHGNY', 'Cardiac glycoside digoxin is obtained from:', 'Digitalis', 'Cinchona', 'Ephedra', 'Cannabis', 'A', 'Digoxin is obtained from Digitalis (foxglove).'],
];

// MULTI_CHOICE: [subj, text, A, B, C, D, E, correctLetters, explanation]
const MULTI = [
  ['PHCOL', 'Which of the following are beta-blockers?', 'Atenolol', 'Metoprolol', 'Amlodipine', 'Propranolol', 'Losartan', 'A;B;D', 'Amlodipine is a CCB; losartan is an ARB.'],
  ['MCHEM', 'Which of the following are penicillins?', 'Amoxicillin', 'Azithromycin', 'Ampicillin', 'Ciprofloxacin', 'Cloxacillin', 'A;C;E', 'Azithromycin is a macrolide; ciprofloxacin is a fluoroquinolone.'],
  ['PHTCS', 'Which excipients can act as tablet diluents/fillers?', 'Lactose', 'Microcrystalline cellulose', 'Magnesium stearate', 'Dibasic calcium phosphate', 'Talc', 'A;B;D', 'Magnesium stearate is a lubricant; talc is a glidant.'],
  ['PHGNY', 'Which crude drugs are alkaloid-bearing?', 'Cinchona', 'Belladonna', 'Senna', 'Opium', 'Nux vomica', 'A;B;D;E', 'Senna contains anthraquinone glycosides, not alkaloids.'],
  ['ANAL', 'Which are chromatographic techniques?', 'HPLC', 'TLC', 'NMR', 'Gas chromatography', 'Column chromatography', 'A;B;D;E', 'NMR is a spectroscopic, not chromatographic, technique.'],
  ['PK', 'Which processes are part of ADME (pharmacokinetics)?', 'Absorption', 'Distribution', 'Metabolism', 'Excretion', 'Translation', 'A;B;C;D', 'Translation is protein synthesis, not pharmacokinetics.'],
  ['CLIN', 'Recognised adverse effects of NSAIDs include:', 'Gastric ulceration', 'Renal impairment', 'Increased bleeding tendency', 'Bronchospasm in sensitive patients', 'Hypoglycaemia', 'A;B;C;D', 'NSAIDs do not characteristically cause hypoglycaemia.'],
  ['MICRO', 'Which are valid methods of sterilization?', 'Autoclaving', 'Membrane filtration', 'Gamma irradiation', 'Dry heat', 'Refrigeration', 'A;B;C;D', 'Refrigeration only slows growth; it does not sterilize.'],
  ['BIOC', 'Which vitamins are fat-soluble?', 'Vitamin A', 'Vitamin D', 'Vitamin C', 'Vitamin K', 'Vitamin E', 'A;B;D;E', 'Vitamin C (and B-complex) are water-soluble.'],
  ['PHCOL', 'Which drugs can cause miosis (pupillary constriction)?', 'Morphine', 'Pilocarpine', 'Atropine', 'Organophosphates', 'Tropicamide', 'A;B;D', 'Atropine and tropicamide cause mydriasis.'],
  ['PHYS', 'Which hormones are secreted by the anterior pituitary?', 'Growth hormone', 'ACTH', 'Oxytocin', 'TSH', 'Prolactin', 'A;B;D;E', 'Oxytocin (and ADH) are released from the posterior pituitary.'],
  ['TOX', 'Which agents are used as chelators for heavy-metal poisoning?', 'EDTA', 'Dimercaprol (BAL)', 'Penicillamine', 'Naloxone', 'Deferoxamine', 'A;B;C;E', 'Naloxone is an opioid antagonist, not a chelator.'],
  ['PHCOL', 'Which of the following are diuretics?', 'Furosemide', 'Hydrochlorothiazide', 'Spironolactone', 'Propranolol', 'Mannitol', 'A;B;C;E', 'Propranolol is a beta-blocker, not a diuretic.'],
  ['MCHEM', 'Which drugs are angiotensin receptor blockers (ARBs)?', 'Losartan', 'Valsartan', 'Enalapril', 'Telmisartan', 'Ramipril', 'A;B;D', 'Enalapril and ramipril are ACE inhibitors.'],
  ['PHTCS', 'Advantages of sustained-release dosage forms include:', 'Reduced dosing frequency', 'Steadier plasma levels', 'Improved patient compliance', 'Rapid onset of action', 'Reduced fluctuation in effect', 'A;B;C;E', 'Rapid onset is a feature of immediate-release forms.'],
  ['PHGNY', 'Which crude drugs are sources of cardiac glycosides?', 'Digitalis', 'Strophanthus', 'Cinchona', 'Squill', 'Nerium', 'A;B;D;E', 'Cinchona yields quinine alkaloids, not cardiac glycosides.'],
  ['ANAL', 'Which are spectroscopic methods?', 'UV-Visible spectroscopy', 'Infrared spectroscopy', 'HPLC', 'Mass spectrometry', 'NMR spectroscopy', 'A;B;D;E', 'HPLC is a separation (chromatographic) technique.'],
  ['CLIN', 'Which drugs commonly require therapeutic drug monitoring?', 'Digoxin', 'Lithium', 'Vancomycin', 'Paracetamol', 'Phenytoin', 'A;B;C;E', 'Paracetamol is not routinely monitored by levels.'],
  ['PHCOL', 'Which of the following are antiplatelet agents?', 'Aspirin', 'Clopidogrel', 'Warfarin', 'Ticagrelor', 'Prasugrel', 'A;B;D;E', 'Warfarin is an anticoagulant, not an antiplatelet.'],
  ['MICRO', 'Which are Gram-positive cocci?', 'Staphylococcus aureus', 'Streptococcus pyogenes', 'Escherichia coli', 'Enterococcus faecalis', 'Pseudomonas aeruginosa', 'A;B;D', 'E. coli and Pseudomonas are Gram-negative.'],
  ['BIOC', 'Which statements about glycolysis are correct?', 'Occurs in the cytoplasm', 'Net production of ATP', 'Requires oxygen', 'Produces pyruvate', 'Produces NADH', 'A;B;D;E', 'Glycolysis is anaerobic and does not require oxygen.'],
  ['PHYS', 'Which are functions of the kidney?', 'Excretion of waste', 'Acid-base balance', 'Blood pressure regulation', 'Bile production', 'Erythropoietin secretion', 'A;B;C;E', 'Bile is produced by the liver.'],
  ['TOX', 'Features of opioid overdose include:', 'Respiratory depression', 'Pinpoint pupils', 'Mydriasis', 'Coma', 'Hypertension', 'A;B;D', 'Opioids cause miosis (not mydriasis) and rarely hypertension.'],
  ['PHCOL', 'Which drugs can prolong the QT interval?', 'Amiodarone', 'Quinidine', 'Amoxicillin', 'Sotalol', 'Haloperidol', 'A;B;D;E', 'Amoxicillin is not a notable QT-prolonging drug.'],
  ['PHTCS', 'Which are parenteral routes of administration?', 'Intravenous', 'Intramuscular', 'Oral', 'Subcutaneous', 'Intradermal', 'A;B;D;E', 'Oral administration is enteral, not parenteral.'],
  ['MCHEM', 'Which classes are beta-lactam antibiotics?', 'Penicillins', 'Cephalosporins', 'Macrolides', 'Carbapenems', 'Monobactams', 'A;B;D;E', 'Macrolides are not beta-lactams.'],
  ['PHGNY', 'Which crude drugs contain volatile (essential) oils?', 'Clove', 'Peppermint', 'Senna', 'Eucalyptus', 'Fennel', 'A;B;D;E', 'Senna is an anthraquinone purgative, not a volatile-oil drug.'],
  ['CLIN', 'Contraindications to ACE inhibitors include:', 'Pregnancy', 'Bilateral renal artery stenosis', 'Hyperkalaemia', 'Angioedema history', 'Mild hypertension', 'A;B;C;D', 'Hypertension is an indication, not a contraindication.'],
  ['PHCOL', 'Which agents act on the renin-angiotensin-aldosterone system?', 'ACE inhibitors', 'ARBs', 'Aliskiren', 'Beta-2 agonists', 'Aldosterone antagonists', 'A;B;C;E', 'Beta-2 agonists act on bronchial smooth muscle.'],
  ['BIOC', 'Which are ketone bodies?', 'Acetoacetate', 'Beta-hydroxybutyrate', 'Acetone', 'Pyruvate', 'Lactate', 'A;B;C', 'Pyruvate and lactate are not ketone bodies.'],
];

// ASSERTION_REASON: [subj, assertion, reason, correctLetter]
const AR = [
  ['PHCOL', 'Low-dose aspirin is used for cardioprotection.', 'Aspirin irreversibly inhibits platelet COX-1, reducing thromboxane A2.', 'A'],
  ['PHCOL', 'Propranolol is contraindicated in asthma.', 'Blockade of beta-2 receptors can cause bronchoconstriction.', 'A'],
  ['MCHEM', 'Penicillins are bactericidal.', 'They inhibit bacterial cell-wall transpeptidase.', 'A'],
  ['PHTCS', 'Magnesium stearate is added to tablet formulations.', 'It functions as a disintegrant.', 'C'],
  ['PHGNY', 'Digoxin increases the force of cardiac contraction.', 'It inhibits the membrane Na+/K+ ATPase.', 'A'],
  ['PK', 'Drugs with high first-pass effect have low oral bioavailability.', 'They are extensively metabolised in the liver before reaching systemic circulation.', 'A'],
  ['CLIN', 'ACE inhibitors can cause a dry cough.', 'They increase bradykinin levels.', 'A'],
  ['MICRO', 'Autoclaving sterilizes at about 121 C.', 'Moist heat under pressure coagulates microbial proteins.', 'A'],
  ['BIOC', 'Vitamin K is required for normal blood clotting.', 'It is a cofactor for gamma-carboxylation of clotting factors II, VII, IX and X.', 'A'],
  ['PHYS', 'Insulin lowers blood glucose.', 'It promotes glucose uptake by translocating GLUT4 transporters.', 'A'],
  ['TOX', 'Atropine is used in organophosphate poisoning.', 'Atropine blocks muscarinic acetylcholine receptors.', 'A'],
  ['PHCOL', 'Morphine causes pupillary constriction.', 'It stimulates the Edinger-Westphal nucleus.', 'A'],
  ['PHCOL', 'Aminoglycosides are given parenterally for systemic infections.', 'They are poorly absorbed from the gastrointestinal tract.', 'A'],
  ['MCHEM', 'Sulfonamides are antibacterial agents.', 'They inhibit dihydrofolate reductase.', 'C'],
  ['PHTCS', 'Enteric coating protects acid-labile drugs.', 'The coating dissolves at acidic gastric pH.', 'C'],
  ['ANAL', 'UV spectroscopy is used for the assay of many drugs.', 'Such drugs contain chromophores that absorb UV light.', 'A'],
  ['PK', 'At steady state, the rate of drug input equals the rate of elimination.', 'Steady state is generally reached in about four to five half-lives.', 'B'],
  ['CLIN', 'Warfarin therapy requires INR monitoring.', 'Warfarin has a narrow therapeutic index and many interactions.', 'A'],
  ['PHCOL', 'Salbutamol relieves bronchospasm in asthma.', 'It is a selective beta-2 adrenergic agonist.', 'A'],
  ['PHCOL', 'Furosemide can cause hypokalaemia.', 'It inhibits the Na-K-2Cl cotransporter in the thick ascending limb, increasing potassium loss.', 'A'],
  ['BIOC', 'G6PD deficiency predisposes to drug-induced haemolysis.', 'Reduced NADPH lowers glutathione, increasing red-cell oxidative damage.', 'A'],
  ['MICRO', 'Ordinary penicillin is ineffective against MRSA.', 'MRSA expresses an altered penicillin-binding protein (PBP2a).', 'A'],
  ['PHYS', 'The kidney participates in blood-pressure regulation.', 'It secretes renin, activating the renin-angiotensin-aldosterone system.', 'A'],
  ['TOX', 'N-acetylcysteine is used in paracetamol poisoning.', 'It replenishes hepatic glutathione stores.', 'A'],
  ['JURIS', 'Schedule H drugs are sold only on prescription.', 'They are listed under the Drugs and Cosmetics Rules.', 'B'],
  ['PHCOL', 'Nitroglycerin relieves anginal pain.', 'It releases nitric oxide, producing venodilation and reduced cardiac preload.', 'A'],
  ['MCHEM', 'Omeprazole reduces gastric acid secretion.', 'It irreversibly inhibits the H+/K+ ATPase proton pump.', 'A'],
  ['PHTCS', 'Suspensions should be shaken before use.', 'Dispersed solid particles tend to settle on standing.', 'A'],
  ['PHGNY', 'Senna is used as a stimulant laxative.', 'It contains anthraquinone glycosides (sennosides).', 'A'],
  ['CLIN', 'Long-term beta-blockers should not be stopped abruptly.', 'Abrupt withdrawal can cause rebound tachycardia and hypertension.', 'A'],
];

// TRUE_FALSE: [subj, statement, 'true'|'false']
const TF = [
  ['PHCOL', 'Adrenaline is the drug of choice for anaphylaxis.', 'true'],
  ['PHCOL', 'Paracetamol is a potent anti-inflammatory NSAID.', 'false'],
  ['MCHEM', 'Penicillins contain a beta-lactam ring.', 'true'],
  ['PHTCS', 'Magnesium stearate is used as a tablet lubricant.', 'true'],
  ['PHTCS', 'Cocoa butter is a water-soluble suppository base.', 'false'],
  ['PHGNY', 'Quinine is obtained from Cinchona bark.', 'true'],
  ['ANAL', 'Karl Fischer titration measures water content.', 'true'],
  ['PK', 'Zero-order kinetics means a constant fraction of drug is eliminated per unit time.', 'false'],
  ['CLIN', 'Vitamin K is the antidote for heparin overdose.', 'false'],
  ['MICRO', 'Gram-positive bacteria appear purple after Gram staining.', 'true'],
  ['BIOC', 'Vitamin C is a fat-soluble vitamin.', 'false'],
  ['PHYS', 'Insulin is secreted by the beta cells of the pancreas.', 'true'],
  ['TOX', 'Naloxone reverses opioid overdose.', 'true'],
  ['JURIS', 'Schedule H drugs may be sold over the counter without a prescription.', 'false'],
  ['PHCOL', 'Loop diuretics act on the thick ascending limb of the loop of Henle.', 'true'],
  ['PHCOL', 'Aspirin reversibly inhibits cyclooxygenase.', 'false'],
  ['MCHEM', 'Proton pump inhibitors typically end in the suffix -prazole.', 'true'],
  ['PHTCS', 'Enteric-coated tablets are designed to dissolve in the stomach.', 'false'],
  ['PK', 'The bioavailability of an intravenously administered drug is 100%.', 'true'],
  ['CLIN', 'ACE inhibitors are considered safe during pregnancy.', 'false'],
  ['MICRO', 'Autoclaving uses dry heat for sterilization.', 'false'],
  ['BIOC', 'HMG-CoA reductase is the rate-limiting enzyme of cholesterol synthesis.', 'true'],
  ['PHYS', 'The normal resting heart rate in adults is 60 to 100 beats per minute.', 'true'],
  ['TOX', 'Atropine is used in the treatment of organophosphate poisoning.', 'true'],
  ['PHCOL', 'Beta-2 agonists such as salbutamol cause bronchodilation.', 'true'],
  ['MCHEM', 'Cephalosporins are beta-lactam antibiotics.', 'true'],
  ['PHGNY', 'Morphine is an alkaloid obtained from opium.', 'true'],
  ['PHTCS', 'An HLB value below 9 indicates a water-in-oil emulsifier.', 'true'],
  ['CLIN', 'Warfarin therapy is monitored using the INR.', 'true'],
  ['PHCOL', 'Digoxin has a wide therapeutic index.', 'false'],
];

// NUMERIC: [subj, text, value, tolerance, explanation]
const NUM = [
  ['PK', 'At a pH equal to the pKa of a drug, the percentage that is ionized is ___ %.', 50, 0, 'By Henderson-Hasselbalch, ionized = unionized at pH = pKa.'],
  ['PK', 'If the elimination rate constant k = 0.0693 per hour, the half-life is ___ hours.', 10, 0.2, 't1/2 = 0.693 / k = 0.693 / 0.0693 = 10 h.'],
  ['PK', 'A 500 mg dose gives an initial plasma concentration of 25 mg/L; the apparent volume of distribution is ___ L.', 20, 0.5, 'Vd = Dose / C0 = 500 / 25 = 20 L.'],
  ['PK', 'If k = 0.1 per hour and Vd = 50 L, the clearance is ___ L/hr.', 5, 0.1, 'CL = k x Vd = 0.1 x 50 = 5 L/hr.'],
  ['PK', 'Oral AUC = 40 and IV AUC = 80 for equal doses; the absolute bioavailability is ___ %.', 50, 1, 'F = (AUCoral / AUCiv) x 100 = 50%.'],
  ['PK', 'Approximately ___ half-lives are required to reach about 97% of steady state.', 5, 0, 'After 5 half-lives roughly 96.9% of steady state is reached.'],
  ['PK', 'The loading dose for Vd = 42 L and target plasma concentration 10 mg/L (F = 1) is ___ mg.', 420, 5, 'LD = Vd x Cp / F = 42 x 10 = 420 mg.'],
  ['PHTCS', 'Isotonic sodium chloride (normal saline) is ___ % w/v.', 0.9, 0.05, 'Normal saline is 0.9% w/v NaCl.'],
  ['PHTCS', 'A 5% w/v solution contains ___ grams of solute per 100 mL.', 5, 0, '5% w/v means 5 g per 100 mL.'],
  ['PHTCS', 'There are ___ milligrams in 1 gram.', 1000, 0, '1 g = 1000 mg.'],
  ['PHTCS', 'There are ___ micrograms in 1 milligram.', 1000, 0, '1 mg = 1000 micrograms.'],
  ['ANAL', 'The pH of a neutral aqueous solution at 25 C is ___.', 7, 0, 'At 25 C neutral pH = 7.'],
  ['BIOC', 'Avogadro number is 6.022 x 10 raised to the power ___.', 23, 0, 'Avogadro constant = 6.022 x 10^23 per mole.'],
  ['PHCOL', 'By Young rule, a 4-year-old child receives ___ mg of a 100 mg adult dose. (age / (age + 12))', 25, 1, '4 / (4 + 12) x 100 = 25 mg.'],
  ['PHCOL', 'By Clark rule, a child weighing 30 lb receives ___ mg of a 150 mg adult dose. (weight / 150)', 30, 1, '30 / 150 x 150 = 30 mg.'],
  ['PK', 'If the half-life is 4 hours, the elimination rate constant k is ___ per hour (0.693 / t1/2).', 0.173, 0.01, 'k = 0.693 / 4 = 0.173 /hr.'],
  ['PHYS', 'Normal human body temperature is ___ C.', 37, 0.3, 'Normal core temperature is about 37 C.'],
  ['PHYS', 'The upper limit of normal fasting blood glucose is about ___ mg/dL.', 100, 5, 'Fasting glucose is normally up to about 100 mg/dL.'],
  ['ANAL', 'Beer-Lambert: with molar absorptivity 1000, path length 1 cm and concentration 0.002 M, the absorbance is ___.', 2, 0.05, 'A = e x b x c = 1000 x 1 x 0.002 = 2.'],
  ['PHTCS', 'A 500 mL bag of 5% w/v dextrose contains ___ grams of dextrose.', 25, 0, '5 g/100 mL x 500 mL = 25 g.'],
  ['PK', 'After 4 half-lives have elapsed, the percentage of drug remaining is ___ %.', 6.25, 0.5, '(1/2)^4 = 6.25%.'],
  ['PHTCS', 'One teaspoonful is approximately ___ mL.', 5, 0, 'A teaspoonful is about 5 mL.'],
  ['PHTCS', 'One tablespoonful is approximately ___ mL.', 15, 0, 'A tablespoonful is about 15 mL.'],
  ['PK', 'If clearance = 6 L/hr and Vd = 60 L, the half-life is ___ hours (0.693 x Vd / CL).', 6.93, 0.2, 't1/2 = 0.693 x 60 / 6 = 6.93 h.'],
  ['ANAL', 'A solution with 1 mole of solute in 2 litres has a molarity of ___ M.', 0.5, 0, 'M = moles / litres = 1 / 2 = 0.5 M.'],
  ['BIOC', 'The approximate net ATP yield from complete aerobic oxidation of one glucose molecule is ___ (use 38).', 38, 2, 'Classic estimate is 36-38 ATP per glucose.'],
  ['PK', 'When the dosing interval equals the half-life, the accumulation factor is about ___.', 2, 0.2, 'Accumulation factor = 1 / (1 - 0.5) = 2.'],
  ['PHTCS', 'Dissolving 2 g of drug to make 50 mL gives a concentration of ___ % w/v.', 4, 0, '2 g / 50 mL x 100 = 4% w/v.'],
  ['JURIS', 'The Pharmacy Act in India was enacted in the year ___.', 1948, 0, 'The Pharmacy Act was passed in 1948.'],
  ['JURIS', 'The Drugs and Cosmetics Act in India was enacted in the year ___.', 1940, 0, 'The Drugs and Cosmetics Act dates from 1940.'],
];

// MATCHING: [subj, text, [[left,right],...]]
const MATCH = [
  ['PHCOL', 'Match each drug to its pharmacological class.', [['Atenolol', 'Beta blocker'], ['Amlodipine', 'Calcium channel blocker'], ['Furosemide', 'Loop diuretic'], ['Losartan', 'Angiotensin receptor blocker']]],
  ['TOX', 'Match each antidote to the poison it treats.', [['Naloxone', 'Opioids'], ['Atropine', 'Organophosphates'], ['N-acetylcysteine', 'Paracetamol'], ['Vitamin K', 'Warfarin']]],
  ['BIOC', 'Match each vitamin to its deficiency disease.', [['Vitamin C', 'Scurvy'], ['Vitamin D', 'Rickets'], ['Vitamin A', 'Night blindness'], ['Vitamin B1', 'Beriberi']]],
  ['PHGNY', 'Match each plant drug to its chief active constituent.', [['Cinchona', 'Quinine'], ['Opium', 'Morphine'], ['Rauwolfia', 'Reserpine'], ['Belladonna', 'Atropine']]],
  ['MCHEM', 'Match each drug-name suffix to its class.', [['-prazole', 'Proton pump inhibitor'], ['-sartan', 'Angiotensin receptor blocker'], ['-dipine', 'Calcium channel blocker'], ['-olol', 'Beta blocker']]],
  ['PHYS', 'Match each hormone to its gland of origin.', [['Insulin', 'Pancreas'], ['Thyroxine', 'Thyroid'], ['Cortisol', 'Adrenal cortex'], ['ADH', 'Posterior pituitary']]],
  ['MICRO', 'Match each stain/organism to its colour or result.', [['Gram positive', 'Purple'], ['Gram negative', 'Pink'], ['Acid-fast bacilli', 'Red (Ziehl-Neelsen)'], ['Bacterial spore', 'Green (malachite green)']]],
  ['PHTCS', 'Match each excipient to its tablet function.', [['Magnesium stearate', 'Lubricant'], ['Starch', 'Disintegrant'], ['Lactose', 'Diluent'], ['Acacia', 'Binder']]],
  ['PK', 'Match each pharmacokinetic parameter to its meaning.', [['Cmax', 'Peak plasma concentration'], ['Tmax', 'Time to peak concentration'], ['AUC', 'Extent of absorption'], ['t1/2', 'Half-life']]],
  ['MCHEM', 'Match each antibiotic to its mechanism of action.', [['Penicillin', 'Cell-wall synthesis inhibition'], ['Tetracycline', '30S ribosome inhibition'], ['Ciprofloxacin', 'DNA gyrase inhibition'], ['Rifampicin', 'RNA polymerase inhibition']]],
  ['PHCOL', 'Match each diuretic to its main site of action.', [['Furosemide', 'Loop of Henle'], ['Hydrochlorothiazide', 'Distal convoluted tubule'], ['Spironolactone', 'Collecting duct'], ['Acetazolamide', 'Proximal convoluted tubule']]],
  ['PHCOL', 'Match each receptor to a representative agonist.', [['Beta-2', 'Salbutamol'], ['Muscarinic', 'Pilocarpine'], ['Alpha-1', 'Phenylephrine'], ['Nicotinic', 'Acetylcholine']]],
  ['CLIN', 'Match each anticoagulant to its monitoring test.', [['Warfarin', 'INR / PT'], ['Unfractionated heparin', 'aPTT'], ['Low-molecular-weight heparin', 'Anti-Xa'], ['Dabigatran', 'No routine monitoring']]],
  ['BIOC', 'Match each enzyme to its metabolic pathway.', [['HMG-CoA reductase', 'Cholesterol synthesis'], ['Hexokinase', 'Glycolysis'], ['Pepsin', 'Protein digestion'], ['Salivary amylase', 'Starch digestion']]],
  ['PHGNY', 'Match each crude drug to its phytochemical class.', [['Senna', 'Anthraquinone glycoside'], ['Digitalis', 'Cardiac glycoside'], ['Clove', 'Volatile oil'], ['Acacia', 'Gum']]],
  ['PHCOL', 'Match each drug to its therapeutic use.', [['Salbutamol', 'Asthma'], ['Metformin', 'Type 2 diabetes'], ['Atorvastatin', 'Hyperlipidaemia'], ['Omeprazole', 'Peptic ulcer disease']]],
  ['PHCOL', 'Match each adverse effect to the responsible drug.', [['Dry cough', 'ACE inhibitors'], ['Gingival hyperplasia', 'Phenytoin'], ['Cinchonism', 'Quinine'], ['Ototoxicity', 'Aminoglycosides']]],
  ['PHTCS', 'Match each dosage form to its route of administration.', [['Suppository', 'Rectal'], ['Metered-dose inhaler', 'Pulmonary'], ['Transdermal patch', 'Skin'], ['Eye drops', 'Ocular']]],
  ['PK', 'Match each pharmacokinetic process to its principal organ.', [['Metabolism', 'Liver'], ['Excretion', 'Kidney'], ['Absorption', 'Small intestine'], ['Distribution', 'Bloodstream']]],
  ['MCHEM', 'Match each inorganic pharmaceutical to its use.', [['Ferrous sulfate', 'Haematinic'], ['Povidone-iodine', 'Antiseptic'], ['Aluminium hydroxide', 'Antacid'], ['Magnesium sulfate', 'Purgative']]],
  ['MICRO', 'Match each vaccine type to an example.', [['Live attenuated', 'BCG'], ['Toxoid', 'Tetanus'], ['Inactivated', 'Rabies'], ['Subunit', 'Hepatitis B']]],
  ['TOX', 'Match each antidote to its target.', [['Flumazenil', 'Benzodiazepines'], ['Protamine', 'Heparin'], ['Deferoxamine', 'Iron'], ['Methylene blue', 'Methaemoglobinaemia']]],
  ['PHYS', 'Match each organ to its primary function.', [['Heart', 'Pumping blood'], ['Lungs', 'Gas exchange'], ['Kidney', 'Filtration of blood'], ['Liver', 'Detoxification']]],
  ['ANAL', 'Match each analytical technique to its main use.', [['HPLC', 'Separation and assay'], ['UV spectroscopy', 'Quantification'], ['IR spectroscopy', 'Functional-group identification'], ['Mass spectrometry', 'Molecular-weight determination']]],
  ['MCHEM', 'Match each drug class to its characteristic suffix.', [['Statins', '-statin'], ['Benzodiazepines', '-pam / -lam'], ['Antivirals', '-vir'], ['ACE inhibitors', '-pril']]],
  ['PHYS', 'Match each neurotransmitter to its main action.', [['Acetylcholine', 'Parasympathetic transmission'], ['Noradrenaline', 'Sympathetic transmission'], ['Dopamine', 'Reward and movement'], ['GABA', 'Inhibitory transmission']]],
  ['PHTCS', 'Match each material to a suitable sterilization method.', [['Heat-stable solution', 'Autoclaving'], ['Heat-labile solution', 'Membrane filtration'], ['Glassware', 'Dry heat'], ['Work surface', 'UV radiation']]],
  ['CLIN', 'Match each drug to its approximate therapeutic range.', [['Digoxin', '0.5-2 ng/mL'], ['Lithium', '0.6-1.2 mmol/L'], ['Theophylline', '10-20 mcg/mL'], ['Phenytoin', '10-20 mcg/mL']]],
  ['PHGNY', 'Match each crude drug to the plant part used.', [['Senna', 'Leaves'], ['Cinchona', 'Bark'], ['Clove', 'Flower bud'], ['Ginger', 'Rhizome']]],
  ['PHCOL', 'Match each emergency drug to its main indication.', [['Adrenaline', 'Anaphylaxis'], ['Atropine', 'Symptomatic bradycardia'], ['Adenosine', 'Supraventricular tachycardia'], ['Amiodarone', 'Ventricular arrhythmia']]],
];

// ── Column layouts (must match the import template) ──
const HEAD = ['questionCode', 'difficulty', 'language', 'questionText', 'explanation'];
const TAIL = ['knowledgeCodes', 'examCodes', 'curriculumNodes', 'trackModules', 'tags', 'mediaType', 'mediaUrl', 'mediaAltText'];
const CHOICE = ['optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'optionF', 'correct'];
const AR_OPTS = [
  'Both A and R are true and R is the correct explanation of A',
  'Both A and R are true but R is not the correct explanation of A',
  'A is true but R is false',
  'A is false but R is true',
];

function tail(subj, i, extraTags) {
  const s = S[subj];
  return {
    knowledgeCodes: s.k,
    examCodes: exam(i),
    curriculumNodes: s.c,
    trackModules: s.t,
    tags: extraTags ? `${s.g};${extraTags}` : s.g,
    mediaType: '',
    mediaUrl: '',
    mediaAltText: '',
  };
}
function head(code, i, text, explanation) {
  return { questionCode: code, difficulty: diff(i), language: 'en', questionText: text, explanation: explanation || '' };
}
const pad = (n) => String(n + 1).padStart(3, '0');

const SHEETS = [
  {
    name: 'SINGLE_CHOICE',
    columns: [...HEAD, ...CHOICE, ...TAIL],
    rows: SINGLE.map((q, i) => ({
      ...head(`PHM-SC-${pad(i)}`, i, q[1], q[7]),
      optionA: q[2], optionB: q[3], optionC: q[4], optionD: q[5], optionE: '', optionF: '', correct: q[6],
      ...tail(q[0], i),
    })),
  },
  {
    name: 'MULTI_CHOICE',
    columns: [...HEAD, ...CHOICE, ...TAIL],
    rows: MULTI.map((q, i) => ({
      ...head(`PHM-MC-${pad(i)}`, i, q[1], q[8]),
      optionA: q[2], optionB: q[3], optionC: q[4], optionD: q[5], optionE: q[6], optionF: '', correct: q[7],
      ...tail(q[0], i),
    })),
  },
  {
    name: 'ASSERTION_REASON',
    columns: [...HEAD, ...CHOICE, ...TAIL],
    rows: AR.map((q, i) => ({
      ...head(`PHM-AR-${pad(i)}`, i, `Assertion (A): ${q[1]}  Reason (R): ${q[2]}`, ''),
      optionA: AR_OPTS[0], optionB: AR_OPTS[1], optionC: AR_OPTS[2], optionD: AR_OPTS[3], optionE: '', optionF: '', correct: q[3],
      ...tail(q[0], i, 'assertion-reason'),
    })),
  },
  {
    name: 'TRUE_FALSE',
    columns: [...HEAD, 'trueFalseAnswer', ...TAIL],
    rows: TF.map((q, i) => ({ ...head(`PHM-TF-${pad(i)}`, i, q[1], ''), trueFalseAnswer: q[2], ...tail(q[0], i) })),
  },
  {
    name: 'NUMERIC',
    columns: [...HEAD, 'numericValue', 'numericTolerance', ...TAIL],
    rows: NUM.map((q, i) => ({
      ...head(`PHM-NU-${pad(i)}`, i, q[1], q[4]),
      numericValue: q[2], numericTolerance: q[3], ...tail(q[0], i),
    })),
  },
  {
    name: 'MATCHING',
    columns: [...HEAD, 'matchingPairs', ...TAIL],
    rows: MATCH.map((q, i) => ({
      ...head(`PHM-MA-${pad(i)}`, i, q[1], ''),
      matchingPairs: q[2].map(([l, r]) => `${l}=${r}`).join(';'),
      ...tail(q[0], i),
    })),
  },
];

const READ_ME = [
  'Pharmacy question bank for the platform import (admin -> Questions -> Import). One sheet per question type.',
  'Upload this whole .xlsx in the Import page. All known type sheets are read automatically; delete any sheet you do not want (it is skipped).',
  'Do NOT rename the type sheets - the sheet name selects the question type. The READ_ME and MAPPING_CODES sheets are ignored on import.',
  'Every question imports as DRAFT, owned by your organization, and then goes through the normal review/publish workflow.',
  'questionCode is unique per organization; codes here use the PHM-<TYPE>-NNN scheme so they will not clash.',
  'tags always apply. knowledgeCodes / examCodes / curriculumNodes / trackModules only attach if those items already exist in your platform (matched by code). See the MAPPING_CODES sheet for every code used here.',
  'Only the knowledge node DEMO-PHARMA exists by default (from the demo seeder); create the other codes first if you want those mappings to resolve - otherwise they are reported as "unknown" and skipped (the question is still created).',
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

  // Reference sheet: every mapping code used, so the user can create matching entities.
  const ref = wb.addWorksheet('MAPPING_CODES');
  ref.columns = [
    { header: 'type', key: 't', width: 16 },
    { header: 'code / path used in this file', key: 'c', width: 48 },
    { header: 'note', key: 'n', width: 60 },
  ];
  ref.getRow(1).font = { bold: true };
  const knowledge = new Set();
  const exams = new Set();
  const currNodes = new Set();
  const trackMods = new Set();
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

  const out = path.join(__dirname, '..', 'pharmacy-questions-import.xlsx');
  await wb.xlsx.writeFile(out);
  console.log(`Wrote ${out}`);
  console.log(`Sheets: ${SHEETS.map((s) => `${s.name}(${s.rows.length})`).join(', ')}  | total questions: ${total}`);
  console.log(`Mapping codes -> knowledge:${knowledge.size} exam:${exams.size} curriculum:${currNodes.size} track:${trackMods.size}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
