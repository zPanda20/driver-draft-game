# Fit season points on the items a team holds, then write pick values (best driver over replacement = 100).
import numpy as np, csv, json, sys
rows = list(csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/fit.csv')))
col = lambda k: np.array([float(r[k]) for r in rows])
d1, d2, pr = col('d1'), col('d2'), col('pr'); y = col('pts')
slots = ['aero', 'engine', 'susp', 'cool']; parts = {s: col(s) for s in slots}
dk = [1, 5, 10, 20, 30, 45, 60, 90]; pk = [1, 5, 10, 20, 30, 44]
def hinge(x, knots):  # piecewise-linear basis: value at each knot
    out = np.zeros((len(x), len(knots)))
    for i, v in enumerate(x):
        j = np.searchsorted(knots, v)
        if j == 0: out[i, 0] = 1
        elif j >= len(knots): out[i, -1] = 1
        else:
            k0, k1 = knots[j-1], knots[j]; w = (v - k0) / (k1 - k0); out[i, j-1] = 1 - w; out[i, j] = w
    return out
Bd = hinge(d1, dk) + hinge(d2, dk); Bp = hinge(pr, pk)
tiers = [10, 20, 30, 50]
Bc = np.concatenate([np.stack([(parts[s] == t).astype(float) for t in tiers[1:]], 1) for s in slots], 1)  # +10 is the baseline
A = np.concatenate([np.ones((len(y), 1)), Bd, Bp, Bc], 1)
lam = 1.0
beta = np.linalg.solve(A.T @ A + lam * np.eye(A.shape[1]), A.T @ y)
bd = beta[1:1+len(dk)]; bp = beta[1+len(dk):1+len(dk)+len(pk)]; bc = beta[1+len(dk)+len(pk):]
def pav(v):  # monotone non-increasing in rank
    blocks = [[x, 1] for x in v]; i = 0
    while i < len(blocks) - 1:
        if blocks[i][0]/blocks[i][1] < blocks[i+1][0]/blocks[i+1][1]:
            blocks[i][0] += blocks[i+1][0]; blocks[i][1] += blocks[i+1][1]; del blocks[i+1]; i = max(0, i-1)
        else: i += 1
    return np.concatenate([[b[0]/b[1]]*b[1] for b in blocks])
bd = pav(bd); bp = pav(bp)
# replacement: a driver ranked 60+ (outside the 2N drafted), a principal ranked 30+
dRep = bd[dk.index(60)]; pRep = bp[pk.index(30)]
scale = 100 / (bd[0] - dRep)
out = {"scale": scale, "drivers": [[r, max(0, (v - dRep) * scale)] for r, v in zip(dk, bd)],
       "principals": [[r, max(0, (v - pRep) * scale)] for r, v in zip(pk, bp)], "parts": {}}
for i, s in enumerate(slots):
    c = bc[i*3:(i+1)*3]
    c = np.maximum.accumulate(np.maximum(c, 0))
    out["parts"][s] = {"10": 0, "20": c[0]*scale, "30": c[1]*scale, "50": c[2]*scale}
json.dump(out, open(sys.argv[2] if len(sys.argv) > 2 else 'data/pickvalues.json', 'w'), indent=1)
print("points per value unit: %.2f" % (1/scale))
print("drivers:", " ".join(f"{r}:{v:.0f}" for r, v in out["drivers"]))
print("principals:", " ".join(f"{r}:{v:.0f}" for r, v in out["principals"]))
for s in slots: print(s.ljust(7), " ".join(f"+{k}:{v:.0f}" for k, v in out["parts"][s].items()))
