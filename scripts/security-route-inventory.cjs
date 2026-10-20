// Inventory mounted Express routes, including path-scoped middleware and spread guard arrays.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'nmt-analytics-api/node_modules/typescript'));
const dir=path.join(root,'nmt-analytics-api/src/routes'),rank=['viewer','agent','manager','director','super_admin'];
function inspect(name,mount='',seen=[]){
 if(seen.includes(name))return [];let src=fs.readFileSync(path.join(dir,name+'.ts'),'utf8'),sf=ts.createSourceFile(name,src,99,true),imports={},vars={},calls=[];
 function walk(n){
  if(ts.isImportDeclaration(n)&&n.importClause?.name&&n.moduleSpecifier.text.startsWith('./'))imports[n.importClause.name.text]=n.moduleSpecifier.text.slice(2);
  if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isIdentifier(n.name))vars[n.name.text]=n.initializer.getText(sf);
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(sf)==='router')calls.push(n);
  ts.forEachChild(n,walk);
 }walk(sf);
 const expanded=a=>{let s=a.getText(sf).replace(/^\.\.\./,'');return vars[s]||s;},uses=[],rows=[];
 for(const n of calls){const method=n.expression.name.text,args=Array.from(n.arguments),p=args[0]&&ts.isStringLiteral(args[0])?args[0].text:null;
  if(method==='use'){
   const children=args.filter(a=>imports[a.getText(sf)]);
   for(const child of children)rows.push(...inspect(imports[child.getText(sf)],mount+(p==='/'?'':p||''),[...seen,name]));
   if(!children.length)uses.push({path:p,text:args.map(expanded).join(' ')});continue;
  }
  if(!['get','post','put','patch','delete'].includes(method)||p===null)continue;
  const guards=[...uses.filter(u=>!u.path||p===u.path||p.startsWith(u.path+'/')).map(u=>u.text),...args.slice(1,-1).map(expanded)].join(' ');
  const roles=Array.from(guards.matchAll(/requireMinimumRole\(['"]([^'"]+)['"]\)/g),m=>m[1]);
  const auth=guards.includes('authenticateToken');const minimum=roles.sort((a,b)=>rank.indexOf(b)-rank.indexOf(a))[0]||(auth?'viewer':null);
  const url=(mount+(p==='/'?'':p))||'/';
  rows.push({module:name,method:method.toUpperCase(),path:url,line:sf.getLineAndCharacterOfPosition(n.pos).line+1,authenticated:auth,minimumRole:minimum,
   realm:url.startsWith('/public/')||url.startsWith('/auth/')||url==='/health'?'public':guards.includes('portalAuth')?'subagent-token':auth?'staff':'inspect',
   roles:Object.fromEntries(['director','manager','agent'].map(role=>[role,minimum?rank.indexOf(role)>=rank.indexOf(minimum):null]))});
 }return rows;
}
const routes=inspect('index').sort((a,b)=>a.path.localeCompare(b.path)||a.method.localeCompare(b.method));
fs.writeFileSync(path.join(root,'docs/operations/authorization-audit/routes.json'),JSON.stringify({generatedFrom:'src/routes/index.ts; includes nested router mounts; role floors are source contracts, not positive workflow certification',routes},null,2)+'\n');
console.log(JSON.stringify({routes:routes.length,modules:new Set(routes.map(r=>r.module)).size,unclassified:routes.filter(r=>r.realm==='inspect')}));
