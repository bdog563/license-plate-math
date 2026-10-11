# License Plate Math

A browser puzzle game: keep four digits in order, add operations and one `=` to make a true equation.

## Files
- `index.html`: the playable game. **Generated; don't edit by hand.** Open it in a browser to play.
- `src/template.html`: page layout, CSS (light/dark color tokens at the top; the puzzle is drawn as a license plate whose `--plate-*` colors stay light in both themes; its backdrop is an inline SVG of shaded functions over a sunset or daytime sky, picked per state by `data-sky`, or a night sky for 5% of plates, which flips the plate's colors light) and the Rules screen text.
- `src/app.js`: game UI: difficulty levels, keypad, hints, scoring, stats (saved in localStorage), and `STATES`, the pun states, slogans and skies the plate cycles through.
- `src/core.js`: the equation checker: tokenizer, parser, exact BigInt-fraction math (floats only for irrational roots/powers), plus `opCount` and `toolTier` (how answers are scored; shared by the game and the tests).
- `src/data.js`: generated puzzle data, one line per ticket 0000–9999: `tier|count|basic|fewest|needs` (`fewest` is empty when `basic` already has the fewest operations; `needs` is the tools of its tier a ticket can't do without, used by the first hint; codes in build_data.py).
- `solver/solve.py`: Python solver that grades every ticket (`tier` 1–3, see build_data.py docstring).
- `solver/build_data.py`: regenerates `src/data.js`.
- `build.py`: assembles `index.html` from `src/`.
- `test_checker.js`: verifies every stored solution passes the in-page checker, and that hint answers obey the modes (the most basic answer stays within its plate's tier; the fewest answer is shortest).

## Workflow
- After editing anything in `src/`: `python3 build.py`
- After changing the rules (allowed operations): update **both** `solver/solve.py` and `src/core.js`, then
  `python3 solver/build_data.py && node test_checker.js && python3 build.py`
- Rules text shown to players lives in `src/template.html` (Rules screen) and the level blurbs in `src/app.js` (`LEVELS`).

## Publishing
- Live at https://bdog563.github.io/license-plate-math/: GitHub Pages serves `index.html` from the `main` branch of github.com/bdog563/license-plate-math.
- To update the live game: `python3 build.py`, then commit and `git push`. Pages redeploys in about a minute.
- `.claude/` is git-ignored. Commits use the GitHub noreply email set in this repo's git config.

## Rules as implemented
- Digits stay in order, each used once; exactly one `=`.
- Allowed: + − × ÷, negative sign, parentheses, joining original digits (47), decimal point on original digits (.7, 4.7), √, ^ (fractional exponents too, like 8^(1/3)), nth roots with an index from the ticket (³√8: the ⁿ√ key or typing `3root8` turns the digits before it into the raised index; any index but 0, odd roots of negatives allowed; √ alone is always a square root), ! (incl. 0! = 1), !! (double factorial).
- Not allowed: splitting/joining computed results, multi-digit whole numbers starting with 0 (07), 0^0.
- Precedence: √ binds to the next number/bracket, then !/!!, then ^ (right-assoc), then unary minus, then × ÷, then + −. So √9! = (√9)!, ³√8! = (³√8)!, −3! = −6, −2^2 = −4. Plain digits right before √ are an error (needs ×); the index has to be made with ⁿ√ or `root`.

## Difficulty (computed in `src/app.js` from tier and count)
- A ticket is "open" if it has ≥5 routes or its most basic answer is one operation (like 15 = 7 + 8).
- Easy: tier 1 and open. Medium: tier 1 not open, or tier 2 open. Hard: tier 2 not open. Expert: tier 3.
- Random: draws equally from every ticket with fewer than two zeros and hides the level (stamp and "Worth N points") until the player clicks "Show difficulty", takes a hint, solves or shows the answer. Points still follow the real level. "Play your own digits" switches to Random.
- Tickets with two or more zeros are excluded from all random draws, Random included (still playable via "Play your own digits").

## Challenge modes (the Challenge switch; `MODES` in `src/app.js`, saved in stats)
- Normal: any correct equation scores; Left/Right totals show while typing.
- Restricted: keys above the level's tier ceiling (`CEILING`: Easy 1, Medium/Hard 2, Expert/Random 3) are disabled, and typing or pasting them is stripped (`dropTools`). A correct answer whose `toolTier` is above the plate's tier gets "try again" instead of points. Hints follow the most basic answer.
- Eco: the goal is the fewest operations on file (`opCount` of `fewest`, else `basic`). A live counter shows operations; the "Show goal" sticker (top-left of the plate) reveals the goal. Over-goal answers get "try again". Hints follow the fewest answer.
- Restricted and Eco hide the Left/Right totals and say only "Not balanced" for wrong answers.
- Tool tiers (shown as keypad groups): Basic + − × ÷ minus signs brackets joined digits; Advanced √ ! whole-number ^; Expert . !! nth roots fractional ^.

## Stored answers (shown after a solve or "Show answer"; hints use `basic`)
- Operation count: every symbol except brackets and `=`. A decimal point counts; joining digits doesn't.
- Most basic (`RANK['basic']` in solve.py): lowest tier, then lowest score (+ − × ÷ and minus sign 1, √ ! ^ 2, . !! ³√ and fractional ^ 3), then least nesting (operations underneath each √ ! !!, so (√9)! = 1 and √(2 + 6 ÷ √9) = 3), then fewest operations, fraction results, minus signs, brackets.
- Fewest operations (`RANK['fewest']`): any tier, fewest operations, then the same order.
- The solver keeps the cheapest tree per value, plus the leanest one to build √ ! !! on. Remaining ties go to whichever it finds first, then the shortest text.

## Solver search limits
Factorials up to 10!, double factorials up to 12!!, integer exponents |b| ≤ 10 (up to 20,000 when the base is 0, 1 or −1, matching the checker), fractional exponents p/q with |p|, q ≤ 10 and an exact answer (tier 3, like nth roots), two stacked unary operations per subexpression. "Unsolvable" means within these limits.
