package cn.kamucl.bridge;

import net.fabricmc.loader.api.FabricLoader;
import java.lang.reflect.*;
import java.io.File;
import java.nio.file.Path;
import java.util.*;
import static cn.kamucl.bridge.ClientConfigs.*;

/** All reads and mutations run on the Minecraft executor, using the loaded registries. */
final class LiveKeybindings {
    private static final String SESSION = UUID.randomUUID().toString();
    private static Class<?> mc(String type) throws Exception { return Class.forName(FabricLoader.getInstance().getMappingResolver().mapClassName("intermediary",type)); }
    private static Method method(String type,String name,String descriptor,Class<?>... parameters) throws Exception {
        Method method=mc(type).getDeclaredMethod(FabricLoader.getInstance().getMappingResolver().mapMethodName("intermediary",type,name,descriptor),parameters);
        method.setAccessible(true);return method;
    }
    private static Object mappedField(Object object,String type,String name,String descriptor) throws Exception {
        return field(mc(type),FabricLoader.getInstance().getMappingResolver().mapFieldName("intermediary",type,name,descriptor)).get(object);
    }
    private static Object options() throws Exception {
        Object client=method("net.minecraft.class_310","method_1551","()Lnet/minecraft/class_310;").invoke(null);
        return mappedField(client,"net.minecraft.class_310","field_1690","Lnet/minecraft/class_315;");
    }
    private static Object input(String key) throws Exception {
        if (!key.matches("(?:key\\.(keyboard|mouse)\\.[a-z0-9.]+|scancode\\.[0-9]+)")) throw new IllegalArgumentException("无效的按键");
        Object parsed=method("net.minecraft.class_3675","method_15981","(Ljava/lang/String;)Lnet/minecraft/class_3675$class_306;",String.class).invoke(null,key);
        if (!key.equals(keyName(parsed))) throw new IllegalArgumentException("无法识别此按键："+key);
        return parsed;
    }
    private static String keyName(Object key) throws Exception { return String.valueOf(method("net.minecraft.class_3675$class_306","method_1441","()Ljava/lang/String;").invoke(key)); }
    private static int keyCode(Object key) throws Exception { return ((Number)method("net.minecraft.class_3675$class_306","method_1444","()I").invoke(key)).intValue(); }
    private static String codeName(int code,boolean keyboard) throws Exception {
        Object kind=mappedField(null,"net.minecraft.class_3675$class_307",keyboard?"field_1668":"field_1672","Lnet/minecraft/class_3675$class_307;");
        return keyName(method("net.minecraft.class_3675$class_307","method_1447","(I)Lnet/minecraft/class_3675$class_306;",int.class).invoke(kind,code));
    }
    private static String translate(String key) throws Exception { return String.valueOf(method("net.minecraft.class_1074","method_4662","(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;",String.class,Object[].class).invoke(null,key,new Object[0])); }
    private static String category(Object key) throws Exception {
        // Category changed from String to a record in 1.21.9; resolve the mapped field dynamically.
        Object cat=mappedField(key,"net.minecraft.class_304","field_1659",categoryDescriptor());
        if (cat instanceof String) return translate((String)cat);
        Object text=method("net.minecraft.class_304$class_11900","method_74697","()Lnet/minecraft/class_2561;").invoke(cat);
        return String.valueOf(method("net.minecraft.class_2561","method_10851","()Ljava/lang/String;").invoke(text));
    }
    private static String categoryDescriptor() {
        try { mc("net.minecraft.class_304$class_11900"); return "Lnet/minecraft/class_304$class_11900;"; }
        catch (Exception ignored) { return "Ljava/lang/String;"; }
    }
    private static Map<String,Object> bind(List<String> keys,int mods,boolean release,boolean pass) {
        return Map.of("keys",keys,"modifiers",mods,"release",release,"passThrough",pass);
    }
    private static Map<String,Object> single(String key) { return bind(key.equals("key.keyboard.unknown")?List.of():List.of(key),0,false,false); }
    private static Map<String,Object> checked(Object raw,String kind) throws Exception {
        if (!(raw instanceof Map<?,?>)) throw new IllegalArgumentException("缺少键位数据");
        Map<?,?> data=(Map<?,?>)raw; Object keys=data.get("keys"),mods=data.get("modifiers");
        if (!(keys instanceof List<?>)||!(mods instanceof Number)||!(data.get("release") instanceof Boolean)||!(data.get("passThrough") instanceof Boolean)) throw new IllegalArgumentException("键位格式无效");
        double modifier=((Number)mods).doubleValue(); if(modifier<0||modifier>63||modifier!=Math.floor(modifier)) throw new IllegalArgumentException("修饰键无效");
        List<String> result=new ArrayList<>();
        for(Object key:(List<?>)keys) { if(!(key instanceof String)||result.size()>=8) throw new IllegalArgumentException("按键数量超限"); input((String)key); if(key.equals("key.keyboard.unknown")||result.contains(key))throw new IllegalArgumentException("按键无效或重复"); result.add((String)key); }
        boolean release=(Boolean)data.get("release"),pass=(Boolean)data.get("passThrough");
        if(!kind.equals("slime")&&(result.size()>1||release||pass)||!kind.equals("meteor")&&modifier!=0)throw new IllegalArgumentException("此绑定不支持组合或修饰键");
        return bind(result,(int)modifier,release,pass);
    }
    private interface Read { Map<String,Object> run() throws Exception; }
    private interface Write { void run(Map<String,Object> value) throws Exception; }
    private static final class Entry {
        Map<String,Object> info; Read read; Write write; RunnableEx save;
        Entry(Map<String,Object> info,Read read,Write write,RunnableEx save){this.info=info;this.read=read;this.write=write;this.save=save;}
    }
    private interface RunnableEx { void run() throws Exception; }
    private static Map<String,Object> info(String id,String label,String category,String kind) { Map<String,Object> result=new LinkedHashMap<>();result.put("id",id);result.put("label",label);result.put("category",category);result.put("kind",kind);return result; }
    private static void vanilla(Map<String,Entry> entries) throws Exception {
        Object options=options(); List<Object> keys=new ArrayList<>(Arrays.asList((Object[])mappedField(options,"net.minecraft.class_315","field_1839","[Lnet/minecraft/class_304;")));
        try{keys.addAll(Arrays.asList((Object[])mappedField(options,"net.minecraft.class_315","field_63493","[Lnet/minecraft/class_304;")));}catch(NoSuchFieldException ignored){} // Newer clients expose editable debug keys separately.
        Method id=method("net.minecraft.class_304","method_1431","()Ljava/lang/String;"),bound=method("net.minecraft.class_304","method_1428","()Ljava/lang/String;"),def=method("net.minecraft.class_304","method_1429","()Lnet/minecraft/class_3675$class_306;"),set=method("net.minecraft.class_304","method_1422","(Lnet/minecraft/class_3675$class_306;)V",mc("net.minecraft.class_3675$class_306"));
        for(Object key:keys) {
            String name=String.valueOf(id.invoke(key)),entryId="key_"+name;
            Map<String,Object> metadata=info(entryId,translate(name),category(key),"vanilla");metadata.put("defaultBinding",single(keyName(def.invoke(key))));
            entries.put(entryId,new Entry(metadata,()->single(String.valueOf(bound.invoke(key))),value->{
                List<?> list=(List<?>)value.get("keys");set.invoke(key,input(list.isEmpty()?"key.keyboard.unknown":(String)list.get(0)));
                method("net.minecraft.class_304","method_1425","()V").invoke(key);
                method("net.minecraft.class_304","method_1426","()V").invoke(null);
            },()->method("net.minecraft.class_315","method_1640","()V").invoke(options)));
        }
    }
    private static Map<String,Object> meteorBind(Object key) throws Exception {
        boolean keyboard=(Boolean)invoke(key,"isKey");int code=((Number)invoke(key,"getValue")).intValue();
        return bind(code==-1?List.of():List.of(codeName(code,keyboard)),((Number)get(key,"modifiers")).intValue(),false,false);
    }
    private static void meteorSet(Object key,Map<String,Object> value) throws Exception {
        List<?> keys=(List<?>)value.get("keys");String name=keys.isEmpty()?"key.keyboard.unknown":(String)keys.get(0);if(name.startsWith("scancode."))throw new IllegalArgumentException("彗星不支持扫描码");boolean keyboard=!name.startsWith("key.mouse.");int code=keyCode(input(name)),mods=((Number)value.get("modifiers")).intValue();
        if(!keyboard&&mods!=0)throw new IllegalArgumentException("鼠标快捷键不支持修饰键");
        if(code!=-1&&!(Boolean)key.getClass().getMethod("canBindTo",boolean.class,int.class,int.class).invoke(key,keyboard,code,mods))throw new IllegalArgumentException("彗星不允许此快捷键");
        key.getClass().getMethod("set",boolean.class,int.class,int.class).invoke(key,keyboard,code,mods);
    }
    private static void meteor(Map<String,Entry> entries) throws Exception {
        Object registry=invoke(Class.forName("meteordevelopment.meteorclient.systems.modules.Modules"),"get");
        for(Object module:(Collection<?>)invoke(registry,"getAll")) {
            String name=String.valueOf(get(module,"name")),title=String.valueOf(get(module,"title"));Object key=get(module,"keybind");
            Map<String,Object> meta=info("meteor:"+name,title+" · 开关快捷键","彗星 · "+get(get(module,"category"),"name"),"meteor");meta.put("module",name);meta.put("defaultBinding",single("key.keyboard.unknown"));
            entries.put((String)meta.get("id"),new Entry(meta,()->meteorBind(key),value->meteorSet(key,value),()->invoke(registry,"save")));
            for(Object group:(Iterable<?>)get(module,"settings")) for(Object setting:(Iterable<?>)group) {
                if(!setting.getClass().getSimpleName().equals("KeybindSetting"))continue;
                String settingName=String.valueOf(get(setting,"name"));Map<String,Object> settingMeta=info("meteor-setting:"+name+":"+get(group,"name")+":"+settingName,title+" · "+get(setting,"title"),"彗星 · "+get(get(module,"category"),"name"),"meteor");settingMeta.put("module",name);settingMeta.put("setting",settingName);settingMeta.put("defaultBinding",meteorBind(invoke(setting,"getDefaultValue")));
                entries.put((String)settingMeta.get("id"),new Entry(settingMeta,()->meteorBind(invoke(setting,"get")),value->{Object copy=invoke(invoke(setting,"get"),"copy");meteorSet(copy,value);if(!Boolean.TRUE.equals(invoke(setting,"set",copy)))throw new IllegalArgumentException("彗星拒绝此设置");},()->invoke(registry,"save")));
            }
        }
    }
    private static Map<String,Object> slimeBind(Object key) throws Exception {
        List<String> keys=new ArrayList<>();for(int code:(int[])invoke(key,"getKeyCodes"))keys.add(codeName(code<0?code+100:code,code>=0));
        return bind(keys,0,(Boolean)invoke(key,"isToggleOnRelease"),(Boolean)invoke(key,"isAllowVanilla"));
    }
    private static void slimeWalk(Map<String,Entry> entries,Object config,Object ref,List<String> path,int depth) throws Exception {
        if(depth>64)return;
        if(ref.getClass().getSimpleName().equals("MapRef")) {
            for(Map.Entry<?,?> child:((Map<?,?>)invoke(ref,"getValue")).entrySet()){List<String> next=new ArrayList<>(path);next.add(String.valueOf(child.getKey()));slimeWalk(entries,config,child.getValue(),next,depth+1);}return;
        }
        if(!ref.getClass().getSimpleName().equals("KeyBindRef"))return;
        File file=(File)invoke(config,"getFile");if(file==null)return;
        Path root=FabricLoader.getInstance().getGameDir().toAbsolutePath().normalize(),absolute=file.toPath().toAbsolutePath().normalize();if(!absolute.startsWith(root))return;
        String relative=root.relativize(absolute).toString().replace('\\','/');Map<String,Object> meta=info("slime:"+relative+":"+String.join("/",path),String.join(" / ",path),"史莱姆 · "+file.getName(),"slime");meta.put("path",path);
        if((Boolean)invoke(ref,"hasDefaultValue"))meta.put("defaultBinding",slimeBind(invoke(ref,"getDefaultValue")));
        entries.put((String)meta.get("id"),new Entry(meta,()->slimeBind(invoke(ref,"getValue")),value->{
            List<String> names=new ArrayList<>();for(Object raw:(List<?>)value.get("keys")){String name=(String)raw;int code=keyCode(input(name));if(name.startsWith("scancode."))throw new IllegalArgumentException("史莱姆不支持扫描码");if(name.startsWith("key.mouse."))code-=100;names.add(String.valueOf(Class.forName("me.matl114.managers.input.KeyCode").getMethod("getNameForKey",int.class).invoke(null,code)));}
            Object desired=Class.forName("me.matl114.managers.input.MultiKeyBind").getConstructor(List.class,boolean.class,boolean.class).newInstance(names,value.get("release"),value.get("passThrough"));
            invoke(ref,"setValue",desired);if(!desired.equals(invoke(ref,"getValue")))throw new IllegalArgumentException("史莱姆拒绝此快捷键");
        },()->invoke(config,"save",file)));
    }
    private static Map<String,Entry> entries(List<String> warnings) throws Exception {
        Map<String,Entry> result=new LinkedHashMap<>();vanilla(result);
        if(loaded("meteordevelopment.meteorclient.systems.modules.Modules"))try{meteor(result);}catch(Exception error){warnings.add("彗星快捷键读取不完整："+error.getMessage());}
        if(loaded("me.matl114.managers.config.Config"))try{for(Object config:(Collection<?>)invoke(Class.forName("me.matl114.managers.config.Config"),"getConfigs"))slimeWalk(result,config,invoke(config,"asRef"),List.of(),0);}catch(Exception error){warnings.add("史莱姆快捷键读取不完整："+error.getMessage());}
        return result;
    }
    private static Map<String,Object> snapshot(Map<String,Entry> entries,List<String> warnings) throws Exception {
        List<Map<String,Object>> items=new ArrayList<>();for(Entry entry:entries.values()){Map<String,Object> item=new LinkedHashMap<>(entry.info);item.put("binding",entry.read.run());items.add(item);}return Map.of("ok",true,"session",SESSION,"items",items,"warnings",warnings);
    }
    static Map<String,Object> snapshot() throws Exception {List<String> warnings=new ArrayList<>();return snapshot(entries(warnings),warnings);}
    private static void fresh(Map<?,?> body) {
        Object raw=body.get("expiresAt");long now=System.currentTimeMillis();
        if(!(raw instanceof Number)||((Number)raw).doubleValue()<now||((Number)raw).doubleValue()>now+30000)throw new IllegalStateException("键位请求已过期，未应用，请重新设置");
    }
    static Map<String,Object> set(Map<?,?> body) throws Exception {
        if(!SESSION.equals(body.get("session")))throw new IllegalStateException("客户端已重启，请重新读取键位");
        fresh(body);
        List<String> warnings=new ArrayList<>();Map<String,Entry> entries=entries(warnings);Entry entry=entries.get(body.get("id"));if(entry==null)throw new IllegalArgumentException("此按键已不在游戏内注册");
        String kind=(String)entry.info.get("kind");Map<String,Object> desired=checked(body.get("binding"),kind),base=checked(body.get("base"),kind),previous=entry.read.run();
        if(!base.equals(previous))throw new IllegalStateException("游戏内已修改此按键，请按新键位重新设置");
        if(desired.equals(previous))return snapshot(entries,warnings);
        fresh(body); // A request queued behind a long reload must not apply after launcher timeout.
        try{entry.write.run(desired);entry.save.run();}
        catch(Exception error){try{entry.write.run(previous);entry.save.run();}catch(Exception rollback){throw new IllegalStateException("按键应用失败且恢复失败，请在游戏内确认："+error.getMessage(),error);}throw new IllegalStateException("按键应用失败，已恢复："+error.getMessage(),error);}
        return snapshot(entries,warnings);
    }
}
