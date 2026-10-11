# Tree-based solver for game rules. Ops by tier:
# T1: + - * / neg concat ; T2: + fact(incl 0!) sqrt, whole-number powers ; T3: + decimals, double factorial, nth roots, fractional powers (a root in disguise)
from fractions import Fraction as F
import math
from functools import lru_cache
import itertools
def isqrt_frac(v):
    if v<=0 or v==1: return None
    n,d=v.numerator,v.denominator
    rn,rd=math.isqrt(n),math.isqrt(d)
    if rn*rn==n and rd*rd==d: return F(rn,rd)
def dfact(n): return math.prod(range(n,0,-2)) if n>0 else 1
def iroot(x,n):  # exact n-th root of a whole number x >= 0, or None
    if x<2: return x
    r=round(x**(1/n))
    for c in (r-1,r,r+1):
        if c>=0 and c**n==x: return c
def nroot(v,n):  # exact n-th root of a fraction (odd roots of negatives too), or None
    if v<0:
        r=None if n%2==0 else nroot(-v,n)
        return None if r is None else -r
    rn,rd=iroot(v.numerator,n),iroot(v.denominator,n)
    if rn is not None and rd is not None: return F(rn,rd)
def fpow(a,b):  # a^b for a fractional b, when the answer is exact (the checker needs a >= 0)
    if a==0: return F(0) if b>0 else None
    r=nroot(a,b.denominator)
    return None if r is None else r**b.numerator
# ex(s) maps each reachable value to (cost, tree), keeping the cheapest tree. A cost counts
#   score each operation scored by its tier: + − × ÷ and a minus sign 1, √ ! ^ 2, !! ³√ a fractional ^ and a decimal point 3
#   nest  operations underneath each √ ³√ ! !!, so (√9)! and √(7 + 2) add 1 and √(2 + 6 ÷ √9) adds 3
#   ops   all symbols (brackets and joined digits are free)
#   frac  operations whose result isn't a whole number (a typed decimal like .5 doesn't count)
#   neg   minus signs in front of a number or bracket
#   br    pairs of brackets the answer needs when written out (see f2)
# and costs compare in the order RANK gives.
RANK={'basic':('score','nest','ops','frac','neg','br'),'fewest':('ops','score','nest','frac','neg','br')}
TP={'num':9,'!':8,'!!':8,'sqrt':7,'root':7,'^':6,'neg':3,'+':1,'-':1,'*':2,'/':2}  # precedence of a tree's top, as in f2
def add(x,y): return (x[0]+y[0],x[1]+y[1],x[2]+y[2],x[3]+y[3],x[4]+y[4],x[5]+y[5])
# Advanced tools by tier (+ − × ÷, minus signs and joined digits are always on). make() takes any set of them.
TIER_TOOLS={1:frozenset(),2:frozenset({'sqrt','fact','pow'})}
TIER_TOOLS[3]=TIER_TOOLS[2]|{'dec','dfact','root','fpow'}
def make(tools,rank='basic',cache=None,memo_len=None):  # memo_len: only remember digit groups up to this long
    vec=lambda **k: tuple(k.get(n,0) for n in RANK[rank])
    ZERO,BASIC,NEG,T2,T3,FRAC=vec(),vec(score=1,ops=1),vec(score=1,ops=1,neg=1),vec(score=2,ops=1),vec(score=3,ops=1),vec(frac=1)
    BRS=(ZERO,vec(br=1),vec(br=2))
    OPS,NEST=RANK[rank].index('ops'),RANK[rank].index('nest')
    def under(c):  # cost of c once a √ ! !! sits on top of it
        l=list(c); l[NEST]+=c[OPS]; return tuple(l)
    track=OPS!=0  # when ops isn't ranked first, also keep the leanest tree, which is cheaper to build √ ! !! on
    def cached(f):
        if memo_len is None: return lru_cache(cache)(f)
        memo={}
        def g(s):
            r=memo.get(s)
            if r is None:
                r=f(s)
                if len(s)<=memo_len: memo[s]=r
            return r
        return g
    @cached
    def ex(s):
        res={}; lean={}
        def put(v,c,t):
            if v.denominator!=1 and t[0]!='num': c=add(c,FRAC)
            e=(c,t); o=res.get(v)
            if o is None or c<o[0]: res[v]=e
            if track:
                o=lean.get(v)
                if o is None or (c[OPS],c)<(o[0][OPS],o[0]): lean[v]=e
        if not (len(s)>1 and s[0]=='0'): put(F(int(s)),ZERO,('num',s))
        if 'dec' in tools:
            for p in range(len(s)):
                put(F(int(s),10**(len(s)-p)),T3,('num',s[:p]+'.'+s[p:]))
        for i in range(1,len(s)):
            L=ex(s[:i]);R=ex(s[i:])
            for a,(ca,ta) in L.items():
                for b,(cb,tb) in R.items():
                    x=add(ca,cb); xb=add(x,BASIC)
                    pa,pb,nb=TP[ta[0]],TP[tb[0]],tb[0]=='neg'
                    c=[(a+b,'+',add(xb,BRS[nb])),(a-b,'-',add(xb,BRS[nb or pb==1])),(a*b,'*',add(xb,BRS[(pa<2)+(nb or pb<2)]))]
                    if b: c.append((a/b,'/',add(xb,BRS[(pa<2)+(nb or pb<=2)])))
                    # small exponents in general; for a base of 0, 1 or −1 any exponent the checker accepts (0^0 isn't allowed)
                    if 'pow' in tools and b.denominator==1 and (abs(b)<=10 and a!=0 and abs(a.numerator)<=1000 and a.denominator<=1000
                                                         or abs(a) in (0,1) and abs(b)<=20000 and (a!=0 or b>0)):
                        c.append((a**int(b),'^',add(add(x,T2),BRS[(pa<7)+(pb<7)])))
                    elif 'fpow' in tools and 1<b.denominator<=10 and abs(b.numerator)<=10 and 0<=a and a.numerator<=1000 and a.denominator<=1000:
                        k=fpow(a,b)  # fractional powers with an exact answer, like 8^(1/3): scored as a root
                        if k is not None: c.append((k,'^',add(add(x,T3),BRS[(pa<7)+(pb<7)])))
                    for k,op,ck in c:
                        if abs(k.numerator)<10**7 and k.denominator<10**5: put(k,ck,(op,ta,tb))
            if 'root' in tools and s[0]!='0':  # the left digits as a raised root index, like ³√8 (any index but 0)
                n=int(s[:i])
                for b,(cb,tb) in R.items():
                    k=nroot(b,n)
                    if k is not None and abs(k.numerator)<10**7 and k.denominator<10**5:
                        put(k,add(add(under(cb),T3),BRS[TP[tb[0]]<9]),('root',s[:i],tb))
        for _ in range(2):
            for v in list(res):
                c,t=res[v]
                put(-v,add(add(c,NEG),BRS[TP[t[0]]<7]),('neg',t))
                ws=[]
                if 'fact' in tools and v.denominator==1 and (v==0 or 3<=v<=10): ws.append((F(math.factorial(int(v))),'!',T2))
                if 'sqrt' in tools:
                    r=isqrt_frac(v)
                    if r is not None: ws.append((r,'sqrt',T2))
                if 'dfact' in tools and v.denominator==1 and 3<=v<=12: ws.append((F(dfact(int(v))),'!!',T3))
                src=[res[v]]+([lean[v]] if track and lean[v] is not res[v] else [])
                for w,op,inc in ws:
                    for cs,ts in src: put(w,add(add(under(cs),inc),BRS[TP[ts[0]]<9]),(op,ts))
        return res
    return ex
PREC={'+':1,'-':1,'*':2,'/':2}
SYM={'+':'+','-':'−','*':'×','/':'÷'}
def fmt(t,parent=0,right=False):
    k=t[0]
    if k=='num': return t[1]
    if k in PREC:
        p=PREC[k]
        s=f'{fmt(t[1],p)} {SYM[k]} {fmt(t[2],p,True)}'
        need = p<parent or (right and p==parent and (parent==1 or True))
        if right and p==parent and k in ('+','*') and parent_op_ok(t): need=need
        return f'({s})' if need else s
    if k=='neg':
        inner=fmt(t[1],3)
        return '−'+inner
    if k in ('!','!!'):
        inner=fmt(t[1],4)
        return inner+k
    if k=='sqrt':
        inner=fmt(t[1],5)
        return '√'+inner
def parent_op_ok(t): return True
def wrap(t,min_prec):
    pass
# Formatter: num=9, postfix=8, sqrt=7, neg=3, binary 1/2
def f2(t,right_of=None):
    k=t[0]
    if k=='num': return t[1],9
    if k in PREC:
        p=PREC[k]
        a,pa=f2(t[1]); b,pb=f2(t[2])
        if pa<p: a=f'({a})'
        if t[2][0]=='neg' or pb<p or (pb==p and k in ('-','/')): b=f'({b})'
        return f'{a} {SYM[k]} {b}',p
    if k=='^':
        a,pa=f2(t[1]); b,pb=f2(t[2])
        if pa<7: a=f'({a})'
        if pb<7: b=f'({b})'
        return f'{a}^{b}',6
    if k=='neg':
        a,pa=f2(t[1])
        if pa<7: a=f'({a})'
        return '−'+a,3
    if k in ('!','!!'):
        a,pa=f2(t[1])
        if pa<9: a=f'({a})'
        return a+k,8
    if k=='sqrt':
        a,pa=f2(t[1])
        if pa<9: a=f'({a})'
        return '√'+a,7
    if k=='root':
        a,pa=f2(t[2])
        if pa<9: a=f'({a})'
        return t[1].translate(SUP)+'√'+a,7
SUP=str.maketrans('0123456789','⁰¹²³⁴⁵⁶⁷⁸⁹')
def show(t): return f2(t)[0]
EX={i:make(TIER_TOOLS[i]) for i in (1,2,3)}
FEWEST=make(TIER_TOOLS[3],'fewest')
# Each solution is (cost, = position, value, left tree, right tree).
def matches(ex,d):
    sols=[]
    for i in range(1,4):
        L=ex(d[:i]);R=ex(d[i:])
        for k in set(L)&set(R):
            (cl,tl),(cr,tr)=L[k],R[k]
            sols.append((add(cl,cr),i,k,tl,tr))
    return sols
def analyze(d):
    for tier in (1,2,3):
        sols=matches(EX[tier],d)
        if sols:
            return tier,sols
    return None,[]
def fewest(d): return matches(FEWEST,d)
# What a tier-2 or tier-3 ticket can't do without: the smallest sets of that tier's own tools that solve it
# (earlier tiers' tools always on), so [('dec',), ('dfact',)] means "a decimal point or !!".
NEW={2:('sqrt','fact','pow'),3:('dec','dfact','root','fpow')}
_solvers={TIER_TOOLS[i]:EX[i] for i in (1,2,3)}
def needs(d,tier):
    out=[]
    for r in range(1,len(NEW[tier])+1):
        for c in itertools.combinations(NEW[tier],r):
            if any(set(o)<=set(c) for o in out): continue
            tools=TIER_TOOLS[tier-1]|frozenset(c)
            if tools not in _solvers: _solvers[tools]=make(tools,cache=512)
            if matches(_solvers[tools],d): out.append(c)
    return out

# ---- Random's tool switches ----
# Six switches, each standing for solver tools: s √, f !, p ^ (whole and fractional powers, both typed with ^),
# d decimal point, w !!, r nth root.
SWITCH={'s':('sqrt',),'f':('fact',),'p':('pow','fpow'),'d':('dec',),'w':('dfact',),'r':('root',)}
BIT={c:1<<i for i,c in enumerate(SWITCH)}
def keep_min(ms):  # the smallest masks among ms: a mask that contains another one is never needed
    out=[]
    for m in sorted(set(ms),key=lambda m:bin(m).count('1')):
        if not any(o&m==o for o in out): out.append(m)
    return out
def merge(o,ms):
    for m in ms:
        if any(x&m==x for x in o): continue
        o=[x for x in o if x&m!=m]+[m]
    return o
@lru_cache(None)
def mex(s):
    """value → the smallest sets of switches (bit masks) that reach it. The same search as make() with every
    tool on (same bounds, same two rounds of minus √ ! !!), tracking tools instead of the cheapest tree,
    so one pass answers "can this be done with these switches?" for every combination at once."""
    res={}
    def put(v,ms):
        o=res.get(v)
        res[v]=list(ms) if o is None else merge(o,ms)
    def plus(ms,c): return keep_min([m|BIT[c] for m in ms])
    if not (len(s)>1 and s[0]=='0'): put(F(int(s)),[0])
    for p in range(len(s)): put(F(int(s),10**(len(s)-p)),[BIT['d']])
    for i in range(1,len(s)):
        L=mex(s[:i]);R=mex(s[i:])
        for a,la in L.items():
            for b,lb in R.items():
                ms=la if lb==[0] else lb if la==[0] else keep_min([x|y for x in la for y in lb])
                c=[a+b,a-b,a*b]
                if b: c.append(a/b)
                for k in c:
                    if abs(k.numerator)<10**7 and k.denominator<10**5: put(k,ms)
                k=None
                if b.denominator==1 and (abs(b)<=10 and a!=0 and abs(a.numerator)<=1000 and a.denominator<=1000
                                         or abs(a) in (0,1) and abs(b)<=20000 and (a!=0 or b>0)): k=a**int(b)
                elif 1<b.denominator<=10 and abs(b.numerator)<=10 and 0<=a and a.numerator<=1000 and a.denominator<=1000: k=fpow(a,b)
                if k is not None and abs(k.numerator)<10**7 and k.denominator<10**5: put(k,plus(ms,'p'))
        if s[0]!='0':
            n=int(s[:i])
            for b,lb in R.items():
                k=nroot(b,n)
                if k is not None and abs(k.numerator)<10**7 and k.denominator<10**5: put(k,plus(lb,'r'))
    for _ in range(2):
        for v,ms in list(res.items()):  # tool sets as they stood when the round began, like make()'s list of values
            put(-v,ms)
            if v.denominator==1 and (v==0 or 3<=v<=10): put(F(math.factorial(int(v))),plus(ms,'f'))
            r=isqrt_frac(v)
            if r is not None: put(r,plus(ms,'s'))
            if v.denominator==1 and 3<=v<=12: put(F(dfact(int(v))),plus(ms,'w'))
    return res
def switch_options(d):
    """Every smallest set of switches that solves plate d, as codes like 's' or 'd+w'; [''] when none is needed."""
    ms=[]
    for i in range(1,4):
        L=mex(d[:i]);R=mex(d[i:])
        for k in set(L)&set(R): ms+=[x|y for x in L[k] for y in R[k]]
    return ['+'.join(c for c in SWITCH if m&BIT[c]) for m in keep_min(ms)]
_option_solvers={}
def option_answers(d,opt):
    """(tier, solutions) using only the switches in opt, preferring whole-number powers to fractional ones."""
    codes=[c for c in opt.split('+') if c]
    tools=frozenset(t for c in codes for t in SWITCH[c])
    for ts in ([tools-{'fpow'}] if 'fpow' in tools else [])+[tools]:
        if ts not in _option_solvers: _option_solvers[ts]=make(ts,memo_len=2)  # a plate's 3-digit groups aren't reused much
        sols=matches(_option_solvers[ts],d)
        if sols: return (3 if set(codes)&{'d','w','r'} or 'fpow' in ts else 2),sols
    return None,[]
