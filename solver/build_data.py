"""Solve all 10,000 tickets and write src/data.js.

Each line of PUZZLES is "tier|count|basic|fewest|needs" for ticket 0000..9999:
  tier 1 = solvable with + − × ÷ (negatives, joined digits)
  tier 2 = also needs √, ! (incl. 0!) or ^
  tier 3 = also needs decimals, !!, an nth root or a fractional power
  count  = distinct (equals position, value) matches at that tier (a rough "how many ways")
  basic  = the most basic answer: only that tier's tools, ranked by RANK['basic'] in solve.py
  fewest = an answer with the fewest operations (every symbol but brackets and =), any tools,
           ranked by RANK['fewest']; empty when the basic answer already has that few
  needs  = for tier 2 and 3, the tools of that tier the ticket can't do without: options split by ","
           (any one is enough), tools within an option joined by "+". Codes: s √, f !, p ^,
           d decimal point, w !!, r nth root, q fractional power. "d,w" = a decimal point or !!
Run from the project root:  python3 solver/build_data.py   (about 20 s)
"""
import json, os, re, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(__file__))
from solve import analyze, fewest, needs, show

CODE = {'sqrt': 's', 'fact': 'f', 'pow': 'p', 'dec': 'd', 'dfact': 'w', 'root': 'r', 'fpow': 'q'}

def best(sols):
    return min(sols, key=lambda s: (s[0], len(show(s[3]) + show(s[4])), abs(s[2].numerator)))

def text(s): return f'{show(s[3])} = {show(s[4])}'

def ops(eq): return len(re.findall(r'!!|[+−×÷^√!.]', eq))

def one(n):
    d = f'{n:04d}'
    tier, sols = analyze(d)
    if not tier:
        raise SystemExit(f'Ticket {d} has no solution under the current rules')
    basic, short = text(best(sols)), text(best(fewest(d)))
    if ops(short) >= ops(basic): short = ''
    need = ','.join('+'.join(CODE[t] for t in o) for o in needs(d, tier)) if tier > 1 else ''
    return f'{tier}|{len(sols)}|{basic}|{short}|{need}'

if __name__ == '__main__':
    with Pool() as p:
        rows = p.map(one, range(10000), chunksize=100)
    out = os.path.join(os.path.dirname(__file__), '..', 'src', 'data.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('const PUZZLES=' + json.dumps('\n'.join(rows), ensure_ascii=False) + '.split("\\n");\n')
    print('wrote', os.path.normpath(out))
