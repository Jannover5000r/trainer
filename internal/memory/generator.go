package memory

import (
	"fmt"
	mathrand "math/rand/v2"
	"os"
	"sort"
	"time"
)

// Profile is a single patient fact sheet as used in the TMS/MedAT memory
// section.
type Profile struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Age        int    `json:"age"`
	Profession string `json:"profession"`
	Diagnosis  string `json:"diagnosis"`
	Medication string `json:"medication"`
	BloodGroup string `json:"blood_group"`
	Symptom    string `json:"symptom"`
}

type profession struct {
	name           string
	female         bool
	minAge, maxAge int
}

var professions = []profession{
	{"Handwerker", false, 20, 60},
	{"Lehrerin", true, 25, 64},
	{"Pilot", false, 26, 60},
	{"Krankenschwester", true, 21, 60},
	{"Student", false, 18, 30},
	{"Ingenieurin", true, 24, 64},
	{"Gärtner", false, 20, 65},
	{"Bäcker", false, 18, 60},
	{"Ärztin", true, 28, 65},
	{"Verkäuferin", true, 19, 60},
}

var firstNamesMale = []string{"Lukas", "Jonas", "Felix", "Maximilian", "David", "Paul", "Erik", "Tobias", "Markus", "Stefan"}
var firstNamesFemale = []string{"Anna", "Lea", "Sophie", "Marie", "Laura", "Julia", "Katharina", "Nina", "Clara", "Hannah"}
var lastNames = []string{"Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Koch", "Richter", "Klein"}

var bloodGroups = []string{"A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"}

type diagnosisMedication struct {
	diagnosis  string
	medication []string
}

var diagnoses = []diagnosisMedication{
	{"Hypertonie", []string{"Ramipril", "Amlodipin", "Metoprolol"}},
	{"Typ-2-Diabetes", []string{"Metformin", "Empagliflozin", "Gliclazid"}},
	{"Asthma bronchiale", []string{"Salbutamol", "Budesonid"}},
	{"Migräne", []string{"Sumatriptan", "Propranolol"}},
	{"Rheumatoide Arthritis", []string{"Ibuprofen", "Methotrexat"}},
	{"Depression", []string{"Sertralin", "Citalopram"}},
	{"Epilepsie", []string{"Levetiracetam", "Valproat"}},
	{"COPD", []string{"Tiotropium", "Formoterol"}},
}

var symptoms = []string{
	"Penicillin-Allergie", "Nussallergie", "Hausstauballergie", "Laktoseintoleranz",
	"chronischer Husten", "Schwindel", "Sehstörungen", "Tinnitus",
	"Kopfschmerzen", "Kurzatmigkeit", "Gelenkschmerzen", "Übelkeit",
	"Pollenallergie", "Latexallergie", "Schlafstörungen",
}

// Generator builds profiles and questions. Safe for concurrent use.
type Generator struct {
	rng *mathrand.Rand
}

// New returns a clock-seeded generator.
func New() *Generator {
	seed := uint64(time.Now().UnixNano()) ^ uint64(os.Getpid())<<32
	return NewWithSeed(seed)
}

// NewWithSeed is intended for deterministic tests.
func NewWithSeed(seed uint64) *Generator {
	return &Generator{rng: mathrand.New(mathrand.NewPCG(seed, seed^0x2545f4914f6cdd1d))}
}

// GenerateProfiles creates between 4 and 8 distinct, internally consistent
// profiles. count is clamped to that range.
func (g *Generator) GenerateProfiles(count int) []Profile {
	if count < 4 {
		count = 4
	}
	if count > 8 {
		count = 8
	}

	usedNames := make(map[string]bool, count)
	profiles := make([]Profile, 0, count)
	for i := 0; i < count; i++ {
		p := g.profile(usedNames)
		profiles = append(profiles, p)
	}
	return profiles
}

func (g *Generator) profile(usedNames map[string]bool) Profile {
	prof := professions[g.intn(len(professions))]
	age := prof.minAge + g.intn(prof.maxAge-prof.minAge+1)

	first := firstNamesFemale
	if !prof.female {
		first = firstNamesMale
	}
	name := ""
	for attempt := 0; attempt < 50; attempt++ {
		candidate := fmt.Sprintf("%s %s", first[g.intn(len(first))], lastNames[g.intn(len(lastNames))])
		if !usedNames[candidate] {
			name = candidate
			usedNames[candidate] = true
			break
		}
	}
	if name == "" {
		name = fmt.Sprintf("Patient %d", len(usedNames)+1)
		usedNames[name] = true
	}

	dx := diagnoses[g.intn(len(diagnoses))]
	return Profile{
		ID:         randomID(),
		Name:       name,
		Age:        age,
		Profession: prof.name,
		Diagnosis:  dx.diagnosis,
		Medication: dx.medication[g.intn(len(dx.medication))],
		BloodGroup: bloodGroups[g.intn(len(bloodGroups))],
		Symptom:    symptoms[g.intn(len(symptoms))],
	}
}

func (g *Generator) intn(n int) int {
	if n <= 0 {
		return 0
	}
	return g.rng.IntN(n)
}

// descriptor renders "der 42-jährige Handwerker" / "die 24-jährige Ärztin".
func (p Profile) descriptor() string {
	article := "der"
	for _, prof := range professions {
		if prof.name == p.Profession {
			if prof.female {
				article = "die"
			}
			break
		}
	}
	return fmt.Sprintf("%s %d-jährige %s", article, p.Age, p.Profession)
}

// fieldValue returns the profile's value for a question field.
func (p Profile) fieldValue(field string) string {
	switch field {
	case "age":
		return fmt.Sprintf("%d Jahre", p.Age)
	case "profession":
		return p.Profession
	case "diagnosis":
		return p.Diagnosis
	case "medication":
		return p.Medication
	case "blood_group":
		return p.BloodGroup
	case "symptom":
		return p.Symptom
	default:
		return ""
	}
}

// sortedStrings returns a stable, de-duplicated copy.
func sortedStrings(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}
