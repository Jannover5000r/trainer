package mathdrill

import "fmt"

// conversion describes a unit conversion. result = value * factor.
type conversion struct {
	from   string
	to     string
	factor float64
	values []float64
}

// conversions are chosen so the resulting values are clean and realistic under
// time pressure. Values are the "from" magnitudes offered to the generator.
var conversions = []conversion{
	{"km/h", "m/s", 1.0 / 3.6, []float64{18, 36, 54, 72, 90, 108, 144}},
	{"m/s", "km/h", 3.6, []float64{5, 10, 15, 20, 25, 30, 40}},
	{"bar", "Pa", 1e5, []float64{0.5, 1, 1.5, 2, 2.5, 3}},
	{"Pa", "kPa", 1e-3, []float64{1000, 2500, 5000, 10000, 25000}},
	{"µg", "mg", 1e-3, []float64{250, 500, 750, 1000, 1500, 2000}},
	{"mg", "g", 1e-3, []float64{250, 500, 750, 1000, 1500, 2000}},
	{"ml", "l", 1e-3, []float64{250, 500, 750, 1000, 1500, 2500}},
	{"mm³", "l", 1e-6, []float64{2e6, 2.5e6, 5e6, 1e7}},
	{"cm³", "ml", 1.0, []float64{5, 10, 20, 50, 100, 250}},
	{"kN", "N", 1e3, []float64{0.5, 1, 2, 5, 10}},
	{"kJ", "J", 1e3, []float64{0.5, 1, 2, 5, 10}},
	{"kWh", "J", 3.6e6, []float64{0.5, 1, 2, 3}},
	{"kHz", "Hz", 1e3, []float64{1, 2, 5, 10, 20}},
	{"g/cm³", "kg/m³", 1e3, []float64{0.5, 1, 1.5, 2, 7.9}},
}

func (g *Generator) units(diff Difficulty) question {
	if g.intn(4) == 0 {
		return g.powerOfTen(diff)
	}
	c := conversions[g.intn(len(conversions))]
	value := g.pickFloat(c.values)
	result := value * c.factor
	return question{
		prompt:     fmt.Sprintf("Rechne %s %s in %s um.", fmtNum(value), c.from, c.to),
		answer:     fmtNum(result),
		answerType: "numeric",
		tolerance:  1e-6,
		unit:       c.to,
	}
}

// powerOfTen covers scientific-notation arithmetic: "2,5 × 10⁴ = ?".
func (g *Generator) powerOfTen(diff Difficulty) question {
	basePool := []float64{2.5, 4, 5, 7.5, 1.2, 3}
	if diff == Hard {
		basePool = []float64{1.25, 2.4, 3.75, 6.4, 8.5}
	}
	base := g.pickFloat(basePool)
	exp := g.between(-3, 6)
	result := base
	for i := 0; i < abs(exp); i++ {
		if exp > 0 {
			result *= 10
		} else {
			result /= 10
		}
	}
	return question{
		prompt:     fmt.Sprintf("%s × 10^%d = ?", fmtNum(base), exp),
		answer:     fmtNum(result),
		answerType: "numeric",
		tolerance:  1e-9,
	}
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
