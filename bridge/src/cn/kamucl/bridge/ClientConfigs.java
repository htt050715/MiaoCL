package cn.kamucl.bridge;

import net.fabricmc.loader.api.FabricLoader;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.DataOutput;
import java.io.DataOutputStream;
import java.lang.reflect.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Optional adapters use the mods actually loaded by Fabric, including Meteor addon systems. */
final class ClientConfigs {
    private static final int MAX_FILE = 128 * 1024 * 1024;
    private static final long MAX_TOTAL = 512L * 1024 * 1024;
    private ClientConfigs() {}

    interface Work { Map<String,Object> run() throws Exception; }
    static Map<String,Object> mainThread(Work work) throws Exception {
        String name = FabricLoader.getInstance().getMappingResolver().mapClassName("intermediary", "net.minecraft.class_310");
        Class<?> clientClass = Class.forName(name);
        String getter = FabricLoader.getInstance().getMappingResolver().mapMethodName("intermediary", "net.minecraft.class_310", "method_1551", "()Lnet/minecraft/class_310;");
        Object client = clientClass.getMethod(getter).invoke(null);
        if (!(client instanceof Executor)) throw new IllegalStateException("Minecraft 主线程尚未准备好");
        AtomicBoolean started = new AtomicBoolean(false), cancelled = new AtomicBoolean(false);
        FutureTask<Map<String,Object>> task = new FutureTask<>(() -> {
            synchronized (started) { if (cancelled.get()) throw new CancellationException(); started.set(true); }
            return work.run();
        });
        ((Executor)client).execute(task);
        try { return task.get(30,TimeUnit.SECONDS); }
        catch (TimeoutException error) {
            synchronized (started) { if (!started.get()) { cancelled.set(true); throw new IllegalStateException("客户端忙碌，参数未应用，请稍后重试"); } }
            // Once mutation starts, wait for its definitive result; never leave a timed-out queued write.
            return task.get();
        }
    }
    static boolean loaded(String className) { try { Class.forName(className,false,ClientConfigs.class.getClassLoader()); return true; } catch (ClassNotFoundException e) { return false; } }
    static Field field(Class<?> type,String name) throws NoSuchFieldException {
        for (Class<?> c=type;c!=null;c=c.getSuperclass()) try { Field f=c.getDeclaredField(name); f.setAccessible(true); return f; } catch (NoSuchFieldException ignored) {}
        throw new NoSuchFieldException(type.getName()+"."+name);
    }
    static Object get(Object object,String name) throws Exception { return field(object.getClass(),name).get(object); }
    static Object staticField(String type,String name) throws Exception { return field(Class.forName(type),name).get(null); }
    static Object invoke(Object object,String name,Object...args) throws Exception {
        Class<?> type=object instanceof Class<?>?(Class<?>)object:object.getClass();
        for (Method method:type.getMethods()) if (method.getName().equals(name)&&method.getParameterCount()==args.length) {
            boolean match=true; Class<?>[] parameters=method.getParameterTypes();
            for (int i=0;i<args.length;i++) if (args[i]!=null&&!parameters[i].isInstance(args[i])) match=false;
            if (!match) continue;
            try { return method.invoke(object instanceof Class<?>?null:object,args); }
            catch (InvocationTargetException error) { Throwable cause=error.getCause(); if (cause instanceof Exception) throw (Exception)cause; throw error; }
        }
        throw new NoSuchMethodException(type.getName()+"."+name);
    }
    static List<?> meteorSystems() throws Exception {
        Object map=staticField("meteordevelopment.meteorclient.systems.Systems","systems");
        return new ArrayList<>(((Map<?,?>)map).values());
    }
    static Map<String,Object> manifest() throws Exception {
        List<String> capabilities=new ArrayList<>(); List<Map<String,Object>> modules=new ArrayList<>(),slimeModules=new ArrayList<>();
        if (loaded("me.matl114.managers.config.Config")) {
            capabilities.add("slimefunhelper");
            Path root=FabricLoader.getInstance().getGameDir().toAbsolutePath().normalize();
            for(Object group:(Collection<?>)invoke(Class.forName("me.matl114.hacks.modules.HackModules"),"getModuleGroups")) {
                for(Object module:(Collection<?>)invoke(group,"getModules")) {
                    java.util.stream.Stream<?> entries=(java.util.stream.Stream<?>)invoke(module,"getModuleEntries");
                    for(Object entry:entries.toList()) {
                        File file=(File)invoke(get(entry,"config"),"getFile");
                        if(file==null||!file.toPath().toAbsolutePath().normalize().startsWith(root))continue;
                        String relative=root.relativize(file.toPath().toAbsolutePath().normalize()).toString().replace('\\','/');
                        String[] path=(String[])invoke(entry,"getPath");
                        String title=String.join(" / ",path);
                        try {
                            Object text=invoke(entry,"getDisplay");
                            String getter=FabricLoader.getInstance().getMappingResolver().mapMethodName("intermediary","net.minecraft.class_2561","method_10851","()Ljava/lang/String;");
                            title=String.valueOf(invoke(text,getter));
                        }catch(ReflectiveOperationException ignored){}
                        slimeModules.add(Map.of("name",String.valueOf(invoke(module,"getName")),"title",title,"file",relative,"path",Arrays.asList(path),"active",invoke(entry,"getActiveState")));
                    }
                }
            }
        }
        if (loaded("meteordevelopment.meteorclient.systems.Systems")) {
            capabilities.add("meteor");
            Object registry=invoke(Class.forName("meteordevelopment.meteorclient.systems.modules.Modules"),"get");
            for (Object module:(Collection<?>)invoke(registry,"getAll")) {
                String category=String.valueOf(get(get(module,"category"),"name"));
                modules.add(Map.of("name",String.valueOf(get(module,"name")),"title",String.valueOf(get(module,"title")),"category",category,"addon",module.getClass().getPackageName(),"active",invoke(module,"isActive")));
            }
        }
        if (loaded("baritone.api.BaritoneAPI")) capabilities.add("baritone");
        List<Map<String,Object>> addons=new ArrayList<>();
        FabricLoader.getInstance().getEntrypointContainers("meteor",Object.class).forEach(entry -> {
            var metadata=entry.getProvider().getMetadata();
            addons.add(Map.of("id",metadata.getId(),"name",metadata.getName(),"version",metadata.getVersion().getFriendlyString()));
        });
        return Map.of("ok",true,"capabilities",capabilities,"modules",modules,"slimeModules",slimeModules,"addons",addons);
    }
    static void flush() throws Exception {
        if (loaded("meteordevelopment.meteorclient.systems.Systems")) invoke(Class.forName("meteordevelopment.meteorclient.systems.Systems"),"save");
        if (loaded("me.matl114.managers.config.Config")) {
            invoke(Class.forName("me.matl114.managers.config.Config"),"configSaveTasks");
            for (Object storage:((Map<?,?>)staticField("me.matl114.managers.FileManager","trackedFileStorages")).values()) {
                // Only dirty cached NBT is saved; clean caches must not overwrite external edits.
                try { if (Boolean.TRUE.equals(get(storage,"dirty"))) invoke(storage,"write"); } catch (NoSuchFieldException ignored) {}
            }
        }
        if (loaded("baritone.api.utils.SettingsUtil")) {
            Object settings=invoke(Class.forName("baritone.api.BaritoneAPI"),"getSettings");
            invoke(Class.forName("baritone.api.utils.SettingsUtil"),"save",settings);
        }
    }
    static Map<String,Object> sync() throws Exception { flush(); return Map.of("ok",true); }
    static Class<?> nbtClass(String intermediary) throws Exception { return Class.forName(FabricLoader.getInstance().getMappingResolver().mapClassName("intermediary",intermediary)); }
    static void nbtPut(Object compound,String key,Object value) throws Exception {
        Class<?> element=nbtClass("net.minecraft.class_2520");
        for (Method method:compound.getClass().getMethods()) if (method.getParameterCount()==2&&method.getParameterTypes()[0]==String.class&&method.getParameterTypes()[1]==element) {method.invoke(compound,key,value);return;}
        throw new NoSuchMethodException("NbtCompound.put");
    }
    @SuppressWarnings("unchecked")
    static Map<String,Object> fullModules() throws Exception {
        Object registry=invoke(Class.forName("meteordevelopment.meteorclient.systems.modules.Modules"),"get");
        Class<?> compound=nbtClass("net.minecraft.class_2487"),listType=nbtClass("net.minecraft.class_2499");
        Object root=compound.getConstructor().newInstance(),moduleList=listType.getConstructor().newInstance();
        List<Map<String,Object>> schema=new ArrayList<>();
        for (Object module:(Collection<?>)invoke(registry,"getAll")) {
            String name=String.valueOf(get(module,"name")); Object moduleTag=invoke(module,"toTag");
            if (moduleTag==null) continue;
            Object settingsTag=compound.getConstructor().newInstance(),groups=listType.getConstructor().newInstance();
            for (Object group:(Iterable<?>)get(module,"settings")) {
                Object groupTag=invoke(group,"toTag"),settings=listType.getConstructor().newInstance();
                String groupName=String.valueOf(get(group,"name"));
                for (Object setting:(Iterable<?>)group) {
                    ((List<Object>)settings).add(invoke(setting,"toTag"));
                    Map<String,Object> metadata=new LinkedHashMap<>();metadata.put("module",name);metadata.put("group",groupName);metadata.put("name",get(setting,"name"));metadata.put("title",get(setting,"title"));metadata.put("description",get(setting,"description"));
                    Object value=invoke(setting,"get");
                    if (value instanceof Enum<?>) { List<String> options=new ArrayList<>(); for (Object option:((Enum<?>)value).getDeclaringClass().getEnumConstants()) options.add(option.toString()); metadata.put("options",options); }
                    for (String boundary:List.of("min","max")) try {Object bound=get(setting,boundary);if(bound instanceof Number&&Double.isFinite(((Number)bound).doubleValue()))metadata.put(boundary,bound);} catch (NoSuchFieldException ignored) {}
                    schema.add(metadata);
                }
                nbtPut(groupTag,"settings",settings);((List<Object>)groups).add(groupTag);
            }
            nbtPut(settingsTag,"groups",groups);nbtPut(moduleTag,"settings",settingsTag);((List<Object>)moduleList).add(moduleTag);
        }
        nbtPut(root,"modules",moduleList);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try (DataOutputStream output=new DataOutputStream(bytes)) {
            boolean written=false;
            for (Method method:nbtClass("net.minecraft.class_2507").getMethods()) if (Modifier.isStatic(method.getModifiers())&&method.getParameterCount()==2&&method.getParameterTypes()[0]==compound&&method.getParameterTypes()[1]==DataOutput.class) {method.invoke(null,root,output);written=true;break;}
            if (!written) throw new NoSuchMethodException("NbtIo.write");
        }
        return Map.of("ok",true,"nbt",Base64.getEncoder().encodeToString(bytes.toByteArray()),"schema",schema);
    }
    static Path target(Path root,String file) throws Exception {
        if (file==null||file.contains("\\")||file.contains(":")) throw new IllegalArgumentException("配置路径无效");
        if (!file.startsWith("slimefunhelper/")&&!file.startsWith("meteor-client/")&&!file.equals("baritone/settings.txt")) throw new IllegalArgumentException("配置路径不受管理");
        for (String part:file.split("/",-1)) if (part.isEmpty()||part.equals(".")||part.equals("..")) throw new IllegalArgumentException("配置路径无效");
        Path destination=root.resolve(file).normalize();
        if (!destination.startsWith(root)) throw new IllegalArgumentException("配置路径超出实例");
        for (Path probe=destination;!probe.equals(root);probe=probe.getParent()) if (Files.isSymbolicLink(probe)) throw new IllegalArgumentException("配置路径不能是符号链接");
        return destination;
    }
    static boolean same(byte[] a,byte[] b) { return Arrays.equals(a,b); }
    static byte[] bytes(Object value) { return value==null?null:Base64.getDecoder().decode(String.valueOf(value)); }
    static void write(Path file,byte[] content) throws Exception {
        if (content==null) { Files.deleteIfExists(file); return; }
        Files.createDirectories(file.getParent()); Path temp=Files.createTempFile(file.getParent(),".miaocl-",".tmp");
        try { Files.write(temp,content); try { Files.move(temp,file,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE); } catch (AtomicMoveNotSupportedException e) { Files.move(temp,file,StandardCopyOption.REPLACE_EXISTING); } }
        finally { Files.deleteIfExists(temp); }
    }
    static void validateHotPaths(Set<String> files) throws Exception {
        Set<String> meteor=new HashSet<>();
        if (loaded("meteordevelopment.meteorclient.systems.Systems")) for (Object system:meteorSystems()) {
            Object file=invoke(system,"getFile"); if (file instanceof File) meteor.add("meteor-client/"+((File)file).getName());
        }
        for (String file:files) {
            if (file.startsWith("meteor-client/")&&!meteor.contains(file)&&!file.startsWith("meteor-client/profiles/")) throw new IllegalArgumentException("此插件文件没有运行时加载入口，请选择下次启动生效："+file);
            if (file.startsWith("slimefunhelper/")&&!file.startsWith("slimefunhelper/runtime/")&&!file.startsWith("slimefunhelper/config/")&&!file.equals("slimefunhelper/internal/friends.nbt")&&!file.equals("slimefunhelper/internal/click-gui-data.nbt")) throw new IllegalArgumentException("此内部缓存需下次启动加载："+file);
            if (file.startsWith("slimefunhelper/")&&!loaded("me.matl114.managers.config.Config")) throw new IllegalArgumentException("SlimefunHelper 未加载");
            if (file.equals("baritone/settings.txt")&&!loaded("baritone.api.BaritoneAPI")) throw new IllegalArgumentException("Baritone 未加载");
        }
    }
    static void reload(Set<String> files) throws Exception {
        if (files.stream().anyMatch(f -> f.startsWith("meteor-client/")&&!f.startsWith("meteor-client/profiles/"))) {
            invoke(Class.forName("meteordevelopment.meteorclient.systems.Systems"),"load");
        }
        if (files.stream().anyMatch(f -> f.startsWith("slimefunhelper/runtime/"))) {
            Object configs=invoke(Class.forName("me.matl114.managers.config.Config"),"getConfigs");
            for (Object config:(Collection<?>)configs) invoke(config,"reload");
        }
        if (files.stream().anyMatch(f -> f.startsWith("slimefunhelper/internal/"))) {
            Object manager=invoke(Class.forName("me.matl114.managers.FileManager"),"getInstance"); invoke(manager,"reloadAll");
            if (files.contains("slimefunhelper/internal/friends.nbt")) {
                Object selector=staticField("me.matl114.hacks.modules.combat.TargetSelector","INSTANCE");
                Object storage=get(selector,"fileStorage"), codec=staticField("me.matl114.hacks.modules.combat.TargetSelector$FriendListStorage","CODEC");
                Object list=invoke(storage,"readOrThrow",codec); invoke(selector,"onListChange",list);
            }
        }
        if (files.contains("baritone/settings.txt")) {
            Object settings=invoke(Class.forName("baritone.api.BaritoneAPI"),"getSettings");
            Object defaults=settings.getClass().getConstructor().newInstance();
            for (Object setting:(Collection<?>)get(settings,"allSettings")) {
                String name=String.valueOf(get(setting,"name"));
                Object original=((Map<?,?>)get(defaults,"byLowerName")).get(name.toLowerCase(Locale.ROOT));
                if (original!=null) field(setting.getClass(),"value").set(setting,get(original,"value"));
            }
            // This installed Baritone exposes readAndApply(Settings,String), not the older one-argument overload.
            invoke(Class.forName("baritone.api.utils.SettingsUtil"),"readAndApply",settings,"settings.txt");
        }
    }
    static Map<String,Object> apply(Map<?,?> body) throws Exception {
        Object raw=body.get("files"); if (!(raw instanceof List<?>)) throw new IllegalArgumentException("缺少配置文件列表");
        List<?> items=(List<?>)raw; if (items.size()>10000) throw new IllegalArgumentException("配置文件过多");
        Path root=FabricLoader.getInstance().getGameDir().toRealPath(), backupRoot=root.resolve(".miaocl-configs/backups/hot-"+UUID.randomUUID());
        if (Files.isSymbolicLink(root.resolve(".miaocl-configs"))) throw new IllegalArgumentException("配置备份目录不能是链接");
        Map<String,byte[]> desired=new LinkedHashMap<>(),expected=new LinkedHashMap<>(),previous=new LinkedHashMap<>(); long total=0;
        for (Object item:items) {
            if (!(item instanceof Map<?,?>)) throw new IllegalArgumentException("配置条目无效"); Map<?,?> entry=(Map<?,?>)item;
            String file=String.valueOf(entry.get("file")); Path destination=target(root,file);
            if (desired.containsKey(file)) throw new IllegalArgumentException("配置路径重复");
            byte[] content=bytes(entry.get("content")),base=bytes(entry.get("base"));
            total+=(content==null?0:content.length)+(base==null?0:base.length);
            if (total>MAX_TOTAL||content!=null&&content.length>MAX_FILE||base!=null&&base.length>MAX_FILE) throw new IllegalArgumentException("配置大小超限");
            if (Files.exists(destination)&&Files.size(destination)>MAX_FILE) throw new IllegalArgumentException("当前文件过大");
            desired.put(file,content); expected.put(file,base);
        }
        Set<String> changed=new HashSet<>(); desired.forEach((file,value) -> {if (!same(value,expected.get(file))) changed.add(file);});
        validateHotPaths(changed);
        flush(); // Flush game-side edits before checking optimistic baselines.
        for (String file:desired.keySet()) {
            Path destination=target(root,file); byte[] content=Files.exists(destination)?Files.readAllBytes(destination):null;
            if (!same(content,expected.get(file))) throw new IllegalStateException("游戏已修改此配置，请刷新后重新编辑："+file);
            previous.put(file,content);
        }
        Files.createDirectories(backupRoot);
        for (String file:changed) if (previous.get(file)!=null) write(backupRoot.resolve(file),previous.get(file));
        try {
            for (String file:changed) write(target(root,file),desired.get(file));
            reload(changed);
            return Map.of("ok",true,"backup",backupRoot.toString());
        } catch (Exception error) {
            List<String> failures=new ArrayList<>();
            for (String file:changed) try { write(target(root,file),previous.get(file)); } catch (Exception rollback) { failures.add(file); }
            try { reload(changed); } catch (Exception rollback) { failures.add("运行时恢复："+rollback.getMessage()); }
            throw new IllegalStateException("热重载失败："+error.getMessage()+(failures.isEmpty()?"；已恢复原配置":"；请重启客户端，回滚失败："+failures),error);
        }
    }
}
