package cn.kamucl.bridge;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.file.Path;

/**
 * MiaoCL 桥接 MOD 入口：启动客户端配置桥接服务。
 */
public final class KamuclBridgeMod implements ModInitializer {
    public static final String MOD_ID = "kamucl-bridge";
    public static final String VERSION = "1.1.2";

    @Override
    public void onInitialize() {
        Path gameDir = FabricLoader.getInstance().getGameDir();
        ParamRegistry.init(gameDir);
        try {
            BridgeServer.start(gameDir, VERSION);
        } catch (Exception e) {
            System.out.println("[MiaoCL Bridge] 桥接服务启动失败（不影响游戏）：" + e.getMessage());
        }
    }
}
