package mathdrill

import "fmt"

// formulas builds physics drills for v = s/t, p = F/A and U = R·I. One of the
// three variables is randomly isolated so the learner has to rearrange the
// equation instead of memorising a single pattern.
func (g *Generator) formulas(diff Difficulty) question {
	switch g.intn(3) {
	case 0:
		return g.speed(diff)
	case 1:
		return g.pressure(diff)
	default:
		return g.ohmsLaw(diff)
	}
}

func (g *Generator) speed(diff Difficulty) question {
	speeds := []float64{2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 20, 25, 30, 36}
	times := []float64{2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 60}
	if diff == Hard {
		speeds = []float64{7, 9, 11, 14, 17, 22, 27, 33, 45, 54}
	}
	v := g.pickFloat(speeds)
	t := g.pickFloat(times)
	s := v * t

	switch g.intn(3) {
	case 0:
		return question{
			prompt:     fmt.Sprintf("Ein Körper legt s = %s m in t = %s s zurück. Berechne v = s/t.", fmtNum(s), fmtNum(t)),
			answer:     fmtNum(v),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "m/s",
		}
	case 1:
		return question{
			prompt:     fmt.Sprintf("Ein Körper bewegt sich mit v = %s m/s für t = %s s. Berechne s = v·t.", fmtNum(v), fmtNum(t)),
			answer:     fmtNum(s),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "m",
		}
	default:
		return question{
			prompt:     fmt.Sprintf("Für s = %s m bei v = %s m/s: Berechne t = s/v.", fmtNum(s), fmtNum(v)),
			answer:     fmtNum(t),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "s",
		}
	}
}

func (g *Generator) pressure(diff Difficulty) question {
	pressures := []float64{2, 5, 10, 20, 25, 50, 100, 200}
	areas := []float64{0.5, 1, 2, 2.5, 4, 5, 10}
	if diff == Hard {
		pressures = []float64{15, 30, 40, 60, 75, 120, 250}
		areas = []float64{0.25, 1.5, 3, 6, 8}
	}
	p := g.pickFloat(pressures)
	a := g.pickFloat(areas)
	f := p * a

	switch g.intn(3) {
	case 0:
		return question{
			prompt:     fmt.Sprintf("Eine Kraft F = %s N wirkt auf eine Fläche A = %s m². Berechne p = F/A.", fmtNum(f), fmtNum(a)),
			answer:     fmtNum(p),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "Pa",
		}
	case 1:
		return question{
			prompt:     fmt.Sprintf("Ein Druck p = %s Pa wirkt auf A = %s m². Berechne F = p·A.", fmtNum(p), fmtNum(a)),
			answer:     fmtNum(f),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "N",
		}
	default:
		return question{
			prompt:     fmt.Sprintf("Bei F = %s N herrscht p = %s Pa. Berechne A = F/p.", fmtNum(f), fmtNum(p)),
			answer:     fmtNum(a),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "m²",
		}
	}
}

func (g *Generator) ohmsLaw(diff Difficulty) question {
	resistances := []float64{2, 4, 5, 10, 20, 25, 40, 50, 100, 200}
	currents := []float64{0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 4, 5}
	if diff == Hard {
		resistances = []float64{3, 6, 8, 12, 15, 30, 60, 150, 250}
		currents = []float64{0.15, 0.3, 0.6, 1.5, 3}
	}
	r := g.pickFloat(resistances)
	i := g.pickFloat(currents)
	u := r * i

	switch g.intn(3) {
	case 0:
		return question{
			prompt:     fmt.Sprintf("R = %s Ω, I = %s A. Berechne U = R·I.", fmtNum(r), fmtNum(i)),
			answer:     fmtNum(u),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "V",
		}
	case 1:
		return question{
			prompt:     fmt.Sprintf("U = %s V, I = %s A. Berechne R = U/I.", fmtNum(u), fmtNum(i)),
			answer:     fmtNum(r),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "Ω",
		}
	default:
		return question{
			prompt:     fmt.Sprintf("U = %s V, R = %s Ω. Berechne I = U/R.", fmtNum(u), fmtNum(r)),
			answer:     fmtNum(i),
			answerType: "numeric",
			tolerance:  1e-6,
			unit:       "A",
		}
	}
}
