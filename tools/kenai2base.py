"""Converte export do Kenai (xlsx/csv) para a base compacta de leads por UF.
uso: python3 kenai2base.py arquivo.xlsx base_existente.json(ou -) saida.json
"""
import sys, zipfile, re, json, csv, io, unicodedata, datetime
import xml.etree.ElementTree as ET

def noacc(s): return unicodedata.normalize('NFD', str(s or '')).encode('ascii','ignore').decode().lower().strip()
def digits(s): return re.sub(r'\D','',str(s or ''))

def read_xlsx(path):
    z=zipfile.ZipFile(path); ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    ss=[''.join(t.text or '' for t in si.iter('{%s}t'%ns['m'])) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)] if 'xl/sharedStrings.xml' in z.namelist() else []
    sheet=sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))[0]
    rows=ET.fromstring(z.read(sheet)).find('m:sheetData',ns)
    def col(r): return re.match(r'[A-Z]+',r).group()
    def val(c):
        t=c.get('t'); v=c.find('m:v',ns)
        if t=='inlineStr': return ''.join(x.text or '' for x in c.iter('{%s}t'%ns['m']))
        if v is None: return ''
        return ss[int(v.text)] if t=='s' else v.text
    out=[]; hdr=None
    for row in rows:
        r={col(c.get('r')):val(c) for c in row}
        if hdr is None: hdr=r; continue
        out.append({hdr[k]:v for k,v in r.items() if k in hdr})
    return out

def read_csv(path):
    txt=open(path,encoding='utf-8-sig',errors='replace').read()
    sep=';' if txt.split('\n')[0].count(';')>txt.split('\n')[0].count(',') else ','
    return list(csv.DictReader(io.StringIO(txt),delimiter=sep))

COLS={'fantasia':['nome fantasia','fantasia'],'razao':['razao social','razao','empresa','nome'],'ddd1':['ddd 1','ddd1','ddd'],'tel1':['telefone 1','telefone1','telefone','celular','whatsapp'],
      'ddd2':['ddd 2','ddd2'],'tel2':['telefone 2','telefone2'],'email':['e-mail','email'],'city':['municipio','cidade'],'uf':['estado','uf'],'bairro':['bairro'],
      'cnpj':['cnpj'],'nature':['natureza juridica'],'capital':['capital social'],'opened':['data inicio atividade','abertura'],'cnae':['cnae principal','cnae']}
SMALL={'de','da','do','das','dos','e','em'}
def title(s):
    w=re.sub(r'\s+',' ',str(s or '').lower()).strip().split(' ')
    t=' '.join(x if (i and x in SMALL) else x[:1].upper()+x[1:] for i,x in enumerate(w) if x)
    return re.sub(r'\b(Ltda|Me|Epp|Eireli)\b', lambda m:m.group().upper(), t)
def phone(ddd,num):
    d,n=digits(ddd),digits(num)
    if not n: return ''
    if not d and len(n)>=10: d,n=n[:2],n[2:]
    if len(n)==8 and n[0] in '6789': n='9'+n
    return d+n

def convert(rows):
    heads=list(rows[0].keys()) if rows else []
    pick={k:next((h for h in heads if noacc(h) in names),None) for k,names in COLS.items()}
    g=lambda r,k: str(r.get(pick[k],'') or '').strip() if pick[k] else ''
    out=[]
    for r in rows:
        name=re.sub(r'^\d{2}\.?\d{3}\.?\d{3}\s+','', g(r,'fantasia') or g(r,'razao'))
        p1=phone(g(r,'ddd1'),g(r,'tel1')); p2=phone(g(r,'ddd2') or g(r,'ddd1'),g(r,'tel2'))
        if not name or not (p1 or p2): continue
        y=re.search(r'(\d{4})',g(r,'opened')); cap=g(r,'capital').replace('.','').replace(',','.')
        try: cap=int(float(cap or 0))
        except: cap=0
        cnpj=digits(g(r,'cnpj')); nat=g(r,'nature')
        out.append([cnpj or 'p'+p1, title(name), p1, p2 if p2!=p1 else '', g(r,'email').lower(), title(g(r,'city')), title(g(r,'bairro')), cap,
                    int(y.group(1)) if y else 0, 1 if re.search(r'individual|\bmei\b',nat,re.I) else 0, digits(g(r,'cnae'))[:7], g(r,'uf').upper()[:2]])
    return out

src,base,dst=sys.argv[1],sys.argv[2],sys.argv[3]
rows=read_csv(src) if src.lower().endswith(('.csv','.txt')) else read_xlsx(src)
new=convert(rows)
COLSOUT=['k','n','p','p2','e','c','b','cap','y','i','cnae','uf']
data={'v':1,'cols':COLSOUT,'rows':[]}
if base!='-':
    try: data=json.load(open(base))
    except Exception: pass
seen={r[0] for r in data['rows']}; seenp={r[2] for r in data['rows'] if r[2]}
added=0
for r in new:
    if r[0] in seen or (r[2] and r[2] in seenp): continue
    data['rows'].append(r); seen.add(r[0]); seenp.add(r[2]); added+=1
ufs={}
for r in data['rows']: ufs[r[11]]=ufs.get(r[11],0)+1
data['updatedAt']=datetime.datetime.utcnow().isoformat()+'Z'
json.dump(data,open(dst,'w'),ensure_ascii=False,separators=(',',':'))
print(json.dumps({'lidas':len(rows),'validas':len(new),'novas':added,'total':len(data['rows']),'ufs':ufs}))
