# Difficulty levels, fitted to hand ratings of 105 borderline plates. A plate's answers are grouped into ideas
# (moving terms across the =, flipping every sign, or putting the same ! or √ on both sides is the same idea),
# and each idea gets a class from what it needs.
#   Basic plates (+ − × ÷ only): Easy if one idea is clean (no brackets, joined digits, fractions or minus out
#     front, like 1 + 2 × 4 = 9) or there are two or more ideas; otherwise Medium.
#   Advanced plates (√ ! ^): an idea is simple when every √ ! ^ works on typed digits (√9, 3!, 2^5) or is a giveaway
#     (0!, 49^0, 1^28); stacked when an advanced op has another inside it ((√9)!, √(8 + 7^0), √(3! × 8 + 1)) or
#     takes a factorial of 6 or more; ordinary otherwise (√ ! ^ around a calculation, or joined digits).
#     Medium if any idea is simple, or there are two ordinary ideas, or ordinary plus plausible stacked ideas
#     (at most 6 operations, advanced ops nested at most two deep) reach three; otherwise Hard.
#   Expert: needs Expert tools.
# The search is make()'s in solve.py (same bounds, same two rounds of minus √ !), keeping the shortest tree for
# each value in each class instead of the cheapest overall.
import math
from fractions import Fraction as F
from functools import lru_cache
from solve import isqrt_frac
PREC={'+':1,'-':1,'*':2,'/':2}
ADV=('!','sqrt','^')
SIMPLE,ORDINARY,STACKED=0,1,2
BR,JN,FR,MI=1,2,4,8  # what a basic answer needs: brackets, joined digits, a fraction, a minus out front
def kids(t): return [x for x in t[1:] if isinstance(x,tuple)]
def inner(t): return t[0]!='num' and (t[0] in ADV or any(inner(x) for x in kids(t)))  # an advanced op somewhere in t
def digit(t): return t[0]=='num' and len(t[1])==1
def search(tools):
    basic=not tools
    @lru_cache(None)
    def ex(s):  # value -> {class: (operations, tree)}; for basic plates the class is a mask of BR JN FR MI
        res={}
        def put(v,c,n,t):
            if abs(v.numerator)>=10**7 or v.denominator>=10**5: return
            slot=res.setdefault(v,{})
            if c not in slot or n<slot[c][0]: slot[c]=(n,t)
        if not (len(s)>1 and s[0]=='0'): put(F(int(s)),0 if len(s)==1 else JN if basic else ORDINARY,0,('num',s))
        for i in range(1,len(s)):
            L,R=ex(s[:i]),ex(s[i:])
            for a,la in L.items():
                for b,lb in R.items():
                    for ca,(na,ta) in la.items():
                        for cb,(nb,tb) in lb.items():
                            n=na+nb+1
                            for v,op in [(a+b,'+'),(a-b,'-'),(a*b,'*')]+([(a/b,'/')] if b else []):
                                if basic:
                                    p=PREC[op]
                                    br=(ta[0] in PREC and PREC[ta[0]]<p) or tb[0]=='neg' or (tb[0] in PREC and (PREC[tb[0]]<p or PREC[tb[0]]==p and op in '-/'))
                                    c=ca|cb|(BR if br else 0)|(FR if v.denominator!=1 else 0)
                                else: c=max(ca,cb)
                                put(v,c,n,(op,ta,tb))
                            if 'pow' in tools and b.denominator==1 and (abs(b)<=10 and a!=0 and abs(a.numerator)<=1000 and a.denominator<=1000
                                                                    or abs(a) in (0,1) and abs(b)<=20000 and (a!=0 or b>0)):
                                if ta[0]=='num' and tb[0]=='num' and (b==0 or a==1) or digit(ta) and digit(tb): c=SIMPLE  # 49^0, 1^28, 2^5
                                elif inner(ta) or inner(tb): c=STACKED  # 2^√9, (7 − 3!)^8
                                else: c=max(ORDINARY,ca,cb)
                                put(a**int(b),c,n,('^',ta,tb))
        for _ in range(2):
            for v,slot in list(res.items()):
                for c0,(n0,t0) in list(slot.items()):
                    put(-v,c0|MI if basic else c0,n0+1,('neg',t0))
                    ws=[]
                    if 'fact' in tools and v.denominator==1 and (v==0 or 3<=v<=10): ws.append((F(math.factorial(int(v))),'!',v>=6))
                    if 'sqrt' in tools:
                        r=isqrt_frac(v)
                        if r is not None: ws.append((r,'sqrt',False))
                    for w,op,big in ws:
                        if big or inner(t0): c=STACKED  # 6!, (√9)!, √(8 + 7^0)
                        elif t0[0]=='num': c=SIMPLE if len(t0[1])==1 or op=='!' else ORDINARY  # √9, 0!; √49 needs a join
                        else: c=max(ORDINARY,c0)
                        put(w,c,n0+1,(op,t0))
        return res
    return ex
SEARCH={1:search(frozenset()),2:search(frozenset({'sqrt','fact','pow'}))}
# ---- ideas: an equation's canonical form, up to rearranging terms across the = and flipping signs ----
def canon(t):
    k=t[0]
    if k=='num': return t[1]
    if k in ('+','-','neg'):  # a sum up to sign, so (8 − 9) and (−8 + 9) match
        ts=add_terms(t,1)
        return '('+min('+'.join(sorted(s+c for s,c in ts)),'+'.join(sorted(flip(s)+c for s,c in ts)))+')'
    if k in ('*','/'): return '['+'*'.join(sorted(e+c for e,c in mul_terms(t,1)))+']'
    return k+'{'+','.join(canon(x) for x in kids(t))+'}'
def flip(s): return {'+':'-','-':'+','^':'/','/':'^'}[s]
def add_terms(t,s):
    if t[0]=='+': return add_terms(t[1],s)+add_terms(t[2],s)
    if t[0]=='-': return add_terms(t[1],s)+add_terms(t[2],-s)
    if t[0]=='neg': return add_terms(t[1],-s)
    return [('+' if s>0 else '-',canon(t))]
def mul_terms(t,e):
    if t[0]=='*': return mul_terms(t[1],e)+mul_terms(t[2],e)
    if t[0]=='/': return mul_terms(t[1],e)+mul_terms(t[2],-e)
    if t[0]=='neg': return mul_terms(t[1],e)
    return [('^' if e>0 else '/',canon(t))]
def idea(l,r):
    while l[0]==r[0] and l[0] in ('!','sqrt','neg'): l,r=l[1],r[1]  # x! = y! is the idea x = y
    ts=add_terms(l,1)+add_terms(r,-1)
    if len(ts)==2 and l[0] not in ('+','-') and r[0] not in ('+','-'): ts,tag=mul_terms(l,1)+mul_terms(r,-1),'x'
    else: tag='s'
    return tag+min('|'.join(sorted(s+c for s,c in ts)),'|'.join(sorted(flip(s)+c for s,c in ts)))
def ideas(d,tier):
    """[(class, operations, left tree, right tree)], one per idea, each in its easiest form."""
    ex=SEARCH[tier]; out={}; reach=set()
    for i in range(1,4):
        L,R=ex(d[:i]),ex(d[i:])
        for k in set(L)&set(R):
            for cl,(nl,tl) in L[k].items():
                for cr,(nr,tr) in R[k].items():
                    key,c,n=idea(tl,tr),cl|cr if tier==1 else max(cl,cr),nl+nr
                    reach.add((i,k,key))
                    if key not in out or (c,k<0,n)<(out[key][0],out[key][4]<0,out[key][1]): out[key]=(c,n,tl,tr,k,i)
    # a mirror image (every value negated) is dropped when a different idea already reaches the positive value there
    return sorted(((c,n,tl,tr) for key,(c,n,tl,tr,k,i) in out.items()
                   if not (k<0 and any(j==i and v==-k and kk!=key for j,v,kk in reach))),key=lambda x:(x[0],x[1]))
def depth(t): return 0 if t[0]=='num' else max([depth(x) for x in kids(t)] or [0])+(t[0] in ADV)
def level(d,tier):
    if tier==3: return 'expert'
    ids=ideas(d,tier)
    if not ids: raise ValueError(f'{d}: no ideas found at tier {tier}')
    if tier==1: return 'easy' if ids[0][0]==0 or len(ids)>=2 else 'medium'
    cs=[c for c,_,_,_ in ids]
    stacked=sum(1 for c,n,l,r in ids if c==STACKED and n<=6 and max(depth(l),depth(r))<=2)
    return 'medium' if SIMPLE in cs or cs.count(ORDINARY)>=2 or cs.count(ORDINARY)+stacked>=3 else 'hard'
