const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/painel.py', 'utf8');
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function setup(mode='') {
  const fields = {
    txt: {value: mode==='abordagem'?'Oi\n\nSegunda mensagem':'Olá',dataset:{chatid:'a',modo:mode}},
    st: {}, ok: {}, catalogoRascunho: {}, catalogoTexto2:{value:'Segunda mensagem'},
  };
  const sent=[];
  const ctx={document:{getElementById:id=>fields[id]},
    conversaAberta:Object.freeze({chatid:'a',fone:'5511000000001'}),
    selId:'a',sel:0,pend:[{chatid:'b',fone:'5511000000002'}],
    pendentes:[],ultimasLinhas:[],Date,JSON,icone:()=>'',esc:x=>x,
    desenhaChat(){},segue:async()=>({estado:'ok'}),
    fetch:async(url,options)=>{sent.push({url,...JSON.parse(options.body)});return {json:async()=>({eid:'ok'})};},
  };
  vm.createContext(ctx);
  vm.runInContext(section('function destinatarioAberto(){','let pend=')+
    section('async function enviar(){','async function mandaAudio('),ctx);
  return {ctx,fields,sent};
}
(async()=>{
  // A fila foi reordenada e o índice agora pertence a B, mas A continua aberto.
  let {ctx,sent}=setup();await ctx.enviar();assert.equal(sent[0].chatid,'a');assert.equal(sent[0].fone,'5511000000001');
  // Trocar de conversa durante um envio de duas mensagens mantém o destino original.
  ({ctx,sent}=setup('abordagem'));
  ctx.segue=async()=>{ctx.selId='b';ctx.conversaAberta={chatid:'b',fone:'5511000000002'};return {estado:'ok'};};
  await ctx.enviar();assert.equal(sent.length,2);assert.ok(sent.every(x=>x.chatid==='a'&&x.fone==='5511000000001'));
  // Composer de A com seleção de B não pode enviar nada.
  ({ctx,sent}=setup());ctx.selId='b';await assert.rejects(ctx.enviar(),/carregar/);assert.equal(sent.length,0);
  // O vídeo e as duas mensagens também ficam na conversa original.
  ({ctx,sent}=setup('catalogo'));await ctx.enviar();assert.equal(sent.length,3);assert.ok(sent.every(x=>x.chatid==='a'&&x.fone==='5511000000001'));
  console.log('Destinatário preservado após reordenação, troca de chat e envio com vídeo; divergências bloqueadas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
