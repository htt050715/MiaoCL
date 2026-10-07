// Exercise the bundled Java bridge against isolated, mapped game registries.
// No user game, options.txt or mod configuration is opened or changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'MiaoCL live keys 中文 '));
const jar=path.resolve('bridge/dist/kamucl-bridge-1.1.4.jar');
const javaHome=process.env.JAVA_HOME||['C:/Program Files/Java','C:/Program Files/Eclipse Adoptium','C:/Program Files/Microsoft'].flatMap(base=>{try{return fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^jdk-21/i.test(e.name)).map(e=>path.join(base,e.name))}catch{return []}}).sort().at(-1);
const tool=name=>javaHome?path.join(javaHome,'bin',name+(process.platform==='win32'?'.exe':'')):name;
const sources=[];
function source(name,code){const file=path.join(root,name.replaceAll('.',path.sep)+'.java');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,code);sources.push(file)}
source('net.fabricmc.loader.api.MappingResolver',`package net.fabricmc.loader.api; public interface MappingResolver {String mapClassName(String ns,String name);String mapMethodName(String ns,String owner,String name,String desc);String mapFieldName(String ns,String owner,String name,String desc);}`);
source('net.fabricmc.loader.api.FabricLoader',`package net.fabricmc.loader.api; import java.nio.file.*; public interface FabricLoader {
 static FabricLoader getInstance(){return Holder.INSTANCE;} MappingResolver getMappingResolver(); Path getGameDir();
 class Holder {static final FabricLoader INSTANCE=new FabricLoader(){public Path getGameDir(){return Path.of(System.getProperty("fixture.dir"));}public MappingResolver getMappingResolver(){return new MappingResolver(){public String mapMethodName(String n,String o,String m,String d){return m;}public String mapFieldName(String n,String o,String m,String d){return m;}public String mapClassName(String n,String c){return "cn.kamucl.bridge.LiveKeysFixture$"+switch(c){case "net.minecraft.class_310"->"Client";case "net.minecraft.class_315"->"Options";case "net.minecraft.class_304"->"KeyBinding";case "net.minecraft.class_304$class_11900"->System.getProperty("fixture.legacy")!=null?"MissingCategory":"Category";case "net.minecraft.class_2561"->"Text";case "net.minecraft.class_3675"->"Input";case "net.minecraft.class_3675$class_306"->"InputKey";case "net.minecraft.class_3675$class_307"->"InputType";case "net.minecraft.class_1074"->"Language";default->throw new IllegalArgumentException(c);};}};}};}}
`);
source('meteordevelopment.meteorclient.systems.modules.Modules',`package meteordevelopment.meteorclient.systems.modules;import java.util.*;
public class Modules {static final Modules INSTANCE=new Modules();public static Modules get(){return INSTANCE;}public List<Module> getAll(){return List.of(module);}public final Module module=new Module();public int saves;public void save(){saves++;}
public static class Module {public String name="test",title="测试模块";public final Category category=new Category();public final Keybind keybind=new Keybind();public final List<Group> settings=List.of(new Group());}
public static class Category {public String name="Combat";}
public static class Group implements Iterable<KeybindSetting> {public String name="General";public final KeybindSetting setting=new KeybindSetting();public Iterator<KeybindSetting> iterator(){return List.of(setting).iterator();}}
public static class KeybindSetting {public String name="action",title="操作快捷键";Keybind value=new Keybind();public Keybind get(){return value;}public Keybind getDefaultValue(){return new Keybind();}public boolean set(Keybind k){value=k;return true;}}
public static class Keybind {private boolean key=true;private int value=-1,modifiers=0;public boolean isKey(){return key;}public int getValue(){return value;}public Keybind copy(){Keybind k=new Keybind();k.set(key,value,modifiers);return k;}public boolean canBindTo(boolean k,int v,int m){return k?v!=256:v>1;}public void set(boolean k,int v,int m){key=k;value=v;modifiers=m;}}
}`);
source('me.matl114.managers.input.MultiKeyBind',`package me.matl114.managers.input;import java.util.*;public class MultiKeyBind {final int[] codes;final boolean release,pass;public MultiKeyBind(List<String> names,boolean r,boolean p){codes=names.stream().mapToInt(Integer::parseInt).toArray();release=r;pass=p;}public int[] getKeyCodes(){return codes;}public boolean isToggleOnRelease(){return release;}public boolean isAllowVanilla(){return pass;}public boolean equals(Object o){return o instanceof MultiKeyBind k&&Arrays.equals(codes,k.codes)&&release==k.release&&pass==k.pass;}}`);
source('me.matl114.managers.input.KeyCode',`package me.matl114.managers.input;public class KeyCode {public static String getNameForKey(int code){return Integer.toString(code);}}`);
source('me.matl114.managers.config.Config',`package me.matl114.managers.config;import java.io.*;import java.util.*;import me.matl114.managers.input.MultiKeyBind;
public class Config {public static final Config instance=new Config();public static Collection<Config> getConfigs(){return List.of(instance);}public File getFile(){return new File(System.getProperty("fixture.dir"),"slimefunhelper/runtime/config.yml");}public MapRef asRef(){return root;}final MapRef root=new MapRef();public int saves;public void save(File file){saves++;}
public static class MapRef {public KeyBindRef key=new KeyBindRef();public Map<String,Object> getValue(){return Map.of("hotkey",key);}}
public static class KeyBindRef {MultiKeyBind value=new MultiKeyBind(List.of(),false,false);public MultiKeyBind getValue(){return value;}public boolean hasDefaultValue(){return true;}public MultiKeyBind getDefaultValue(){return new MultiKeyBind(List.of(),false,false);}public void setValue(Object value){this.value=(MultiKeyBind)value;}}
}`);
source('cn.kamucl.bridge.LiveKeysFixture',`package cn.kamucl.bridge;
import java.util.*;import java.nio.file.*;import java.util.concurrent.*;import java.io.*;
public class LiveKeysFixture {
 static void thread(){if(!Thread.currentThread().getName().equals("fixture-game-main"))throw new AssertionError("not game thread");}
 public static class Client implements Executor {static final Client INSTANCE=new Client();public final Options field_1690=new Options();final ExecutorService executor=Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"fixture-game-main");t.setDaemon(true);return t;});public static Client method_1551(){return INSTANCE;}public void execute(Runnable r){executor.execute(r);}}
 public static class Options {public KeyBinding[] field_1839={new KeyBinding("key.forward"),new KeyBinding("mod.menu")};public int writes;public boolean fail;public void method_1640(){thread();if(fail){fail=false;throw new IllegalStateException("save failed");}writes++;}}
 public static class Text {public String method_10851(){return "移动";}}
 public static class Category {public Text method_74697(){return new Text();}}
 public static class Language {public static String method_4662(String key,Object[] args){thread();return key.equals("key.forward")?"前进":key;}}
 public static class KeyBinding {public Object field_1659=System.getProperty("fixture.legacy")==null?new Category():"key.categories.movement";final String id;InputKey key=new InputKey("key.keyboard.w",87);KeyBinding(String id){this.id=id;}public String method_1431(){thread();return id;}public String method_1428(){thread();return key.name;}public InputKey method_1429(){return new InputKey("key.keyboard.w",87);}public void method_1422(InputKey k){thread();key=k;}private void method_1425(){thread();}public static int rebuilds;public static void method_1426(){thread();rebuilds++;}}
 public static class InputKey {final String name;final int code;InputKey(String n,int c){name=n;code=c;}public String method_1441(){return name;}public int method_1444(){return code;}}
 public static class Input {static final Map<String,Integer> codes=Map.of("key.keyboard.unknown",-1,"key.keyboard.w",87,"key.keyboard.r",82,"key.keyboard.x",88,"key.keyboard.left.control",341,"key.mouse.left",0,"key.mouse.middle",2,"key.mouse.4",3);public static InputKey method_15981(String name){Integer code=codes.get(name);if(code==null)throw new IllegalArgumentException("invalid key");return new InputKey(name,code);}}
 public static class InputType {public static final InputType field_1668=new InputType(true),field_1672=new InputType(false);final boolean keyboard;InputType(boolean k){keyboard=k;}public InputKey method_1447(int code){for(var pair:Input.codes.entrySet())if(pair.getValue()==code&&pair.getKey().startsWith(keyboard?"key.keyboard.":"key.mouse."))return new InputKey(pair.getKey(),code);throw new IllegalArgumentException("invalid code");}}
 static Map<String,Object> bind(List<String> keys,int modifiers,boolean release,boolean pass){return Map.of("keys",keys,"modifiers",modifiers,"release",release,"passThrough",pass);}
 static Map<String,Object> binding(String key){return bind(List.of(key),0,false,false);}
 static Map<?,?> find(Map<String,Object> snapshot,String id){return ((List<Map<?,?>>)snapshot.get("items")).stream().filter(item->id.equals(item.get("id"))).findFirst().orElseThrow();}
 static Map<String,Object> set(Map<String,Object> state,String id,Map<String,Object> desired)throws Exception{return ClientConfigs.mainThread(()->LiveKeybindings.set(Map.of("session",state.get("session"),"id",id,"base",find(state,id).get("binding"),"binding",desired,"expiresAt",System.currentTimeMillis()+25000)));}
 static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
 static void tests()throws Exception{
  Map<String,Object> first=ClientConfigs.mainThread(LiveKeybindings::snapshot);check(((List<?>)first.get("warnings")).isEmpty(),"adapter warnings");check(((List<?>)first.get("items")).size()==5,"all registrations incl custom keys");
  Map<String,Object> changed=set(first,"key_key.forward",binding("key.keyboard.r"));check(find(changed,"key_key.forward").get("binding").equals(binding("key.keyboard.r")),"launcher to game");check(Client.INSTANCE.field_1690.writes==1&&KeyBinding.rebuilds==1,"saved and rebuilt registry");
  ClientConfigs.mainThread(()->{Client.INSTANCE.field_1690.field_1839[0].method_1422(Input.method_15981("key.keyboard.x"));return Map.of();});
  Map<String,Object> fromGame=ClientConfigs.mainThread(LiveKeybindings::snapshot);check(find(fromGame,"key_key.forward").get("binding").equals(binding("key.keyboard.x")),"game menu to launcher");
  try{set(changed,"key_key.forward",binding("key.keyboard.w"));throw new AssertionError("stale write accepted");}catch(ExecutionException expected){check(expected.getCause().getMessage().contains("游戏内已修改"),"conflict");}
  Client.INSTANCE.field_1690.fail=true;try{set(fromGame,"key_key.forward",binding("key.keyboard.w"));throw new AssertionError("failed save accepted");}catch(ExecutionException expected){}
  check(ClientConfigs.mainThread(LiveKeybindings::snapshot).equals(fromGame),"failed save rolled back");
  changed=set(fromGame,"meteor:test",bind(List.of("key.keyboard.r"),2,false,false));check(find(changed,"meteor:test").get("binding").equals(bind(List.of("key.keyboard.r"),2,false,false)),"meteor modifiers");
  changed=set(changed,"meteor-setting:test:General:action",binding("key.mouse.middle"));check(find(changed,"meteor-setting:test:General:action").get("binding").equals(binding("key.mouse.middle")),"meteor setting callback");
  String slime="slime:slimefunhelper/runtime/config.yml:hotkey";changed=set(changed,slime,bind(List.of("key.keyboard.left.control","key.mouse.4"),0,true,true));check(find(changed,slime).get("binding").equals(bind(List.of("key.keyboard.left.control","key.mouse.4"),0,true,true)),"slime combo flags and mouse code");
  ClientConfigs.mainThread(()->{meteordevelopment.meteorclient.systems.modules.Modules.get().module.keybind.set(true,87,1);return Map.of();});
  check(find(ClientConfigs.mainThread(LiveKeybindings::snapshot),"meteor:test").get("binding").equals(bind(List.of("key.keyboard.w"),1,false,false)),"meteor menu reverse sync");
  try{ClientConfigs.mainThread(()->LiveKeybindings.set(Map.of("session","old","id","key_key.forward","base",binding("key.keyboard.x"),"binding",binding("key.keyboard.w"))));throw new AssertionError("old session accepted");}catch(ExecutionException expected){}
  final Map<String,Object> last=ClientConfigs.mainThread(LiveKeybindings::snapshot);
  try{ClientConfigs.mainThread(()->LiveKeybindings.set(Map.of("session",last.get("session"),"expiresAt",0,"id","key_key.forward","base",binding("key.keyboard.x"),"binding",binding("key.keyboard.w"))));throw new AssertionError("expired write accepted");}catch(ExecutionException expected){check(expected.getCause().getMessage().contains("过期"),"expiry");}
  System.out.println("ADAPTER_TESTS_PASSED");
 }
 public static void main(String[] args)throws Exception{System.setProperty("fixture.dir",args[0]);tests();BridgeServer.start(Path.of(args[0]),"1.1.4");System.out.println("FIXTURE_READY");try(BufferedReader reader=new BufferedReader(new InputStreamReader(System.in))){String command;while((command=reader.readLine())!=null){if(command.equals("game-change")){ClientConfigs.mainThread(()->{Client.INSTANCE.field_1690.field_1839[1].method_1422(Input.method_15981("key.keyboard.x"));return Map.of();});System.out.println("GAME_CHANGED");}else break;}}}
}
`);
const cp=[root,jar,path.resolve('bridge/.cache/gson-2.14.0.jar')].join(path.delimiter);
const compile=spawnSync(tool('javac'),['-encoding','UTF-8','--release','17','-cp',cp,'-d',root,...sources],{encoding:'utf8',windowsHide:true});
assert.ifError(compile.error);assert.equal(compile.status,0,compile.stderr);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const results=[];
 for(const legacy of [false,true]){
  const dir=path.join(root,legacy?'legacy':'modern');fs.mkdirSync(dir);
  const child=spawn(tool('java'),[...(legacy?['-Dfixture.legacy=true']:[]),'-cp',cp,'cn.kamucl.bridge.LiveKeysFixture',dir],{windowsHide:true});
  let output='',error='',exited=false;child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>error+=data);
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{exited=true;resolve({code,signal})})});
  async function wait(text){const deadline=Date.now()+8000;while(!output.includes(text)&&!exited&&Date.now()<deadline)await sleep(20);assert(output.includes(text),output+error)}
  try{
   await wait('FIXTURE_READY');assert(output.includes('ADAPTER_TESTS_PASSED'));
   const d=JSON.parse(fs.readFileSync(path.join(dir,'.kamucl-bridge.json'))),base=`http://127.0.0.1:${d.port}/kamucl/v1/`,headers={'X-Kamucl-Token':d.token};
   assert.equal((await fetch(base+'keybindings/snapshot')).status,401);
   assert.equal((await(await fetch(base+'keybindings/set',{headers})).json()).ok,false);
   const snapshot=await(await fetch(base+'keybindings/snapshot',{headers})).json();assert.equal(snapshot.ok,true);
   const item=snapshot.items.find(item=>item.id==='key_mod.menu');
   const body={session:snapshot.session,id:item.id,expiresAt:Date.now()+25000,base:item.binding,binding:{keys:['key.keyboard.r'],modifiers:0,release:false,passThrough:false}};
   const result=await(await fetch(base+'keybindings/set',{method:'POST',headers,body:JSON.stringify(body)})).json();assert.equal(result.ok,true);assert.equal(result.items.find(item=>item.id===body.id).binding.keys[0],'key.keyboard.r');
   child.stdin.write('game-change\n');await wait('GAME_CHANGED');
   const reverse=await(await fetch(base+'keybindings/snapshot',{headers})).json();assert.equal(reverse.items.find(item=>item.id===body.id).binding.keys[0],'key.keyboard.x');
   const conflict=await(await fetch(base+'keybindings/set',{method:'POST',headers,body:JSON.stringify({...body,base:result.items.find(item=>item.id===body.id).binding})})).json();assert.equal(conflict.ok,false);assert.match(conflict.error,/游戏内已修改/);
   child.stdin.end('exit\n');let timeout;const ended=await Promise.race([done,new Promise(resolve=>timeout=setTimeout(()=>resolve(null),4000))]);clearTimeout(timeout);assert.deepEqual(ended,{code:0,signal:null},error);
   results.push({legacy,registryKeys:true,mainThread:true,launcherToGame:true,gameToLauncher:true,meteor:true,slime:true,conflict:true,rollback:true,session:true,httpAuth:true});
  }finally{if(!exited){child.kill();await done}}
 }
 fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/live-keybindings-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
