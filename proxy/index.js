import { readFileSync } from "fs";
import * as https from "https";
import { WebSocketServer } from "ws";
import { BRANDING, config, NETWORK_VERSION, VERSION } from "./config.js";
import { handlePacket } from "./listener.js";
import { Logger } from "./logger.js";
import { disconnect, generateMOTDImage } from "./utils.js";
import { ChatColor, ProxiedPlayer, State } from "./types.js";
import { genUUID } from "./utils.js";
const logger = new Logger("EagXProxy");
const connectionLogger = new Logger("ConnectionHandler");
global.PROXY = {
    brand: BRANDING,
    version: VERSION,
    MOTDVersion: NETWORK_VERSION,
    serverName: config.name,
    secure: false,
    proxyUUID: genUUID(config.name),
    MOTD: {
        icon: config.motd.iconURL ? await generateMOTDImage(readFileSync(config.motd.iconURL)) : null,
        motd: [config.motd.l1, config.motd.l2]
    },
    wsServer: null,
    players: new Map(),
    logger: logger,
    config: config
};
let server;
if (PROXY.config.security.enabled) {
    logger.info(`Starting SECURE WebSocket proxy on port ${config.bindPort}...`);
    if (process.env.REPL_SLUG) {
        logger.warn("You appear to be running the proxy on Repl.it with encryption enabled. Please note that Repl.it by default provides encryption, and enabling encryption may or may not prevent you from connecting to the server.");
    }
    server = new WebSocketServer({
        server: https.createServer({
            key: readFileSync(config.security.key),
            cert: readFileSync(config.security.cert)
        }).listen(config.bindPort, config.bindHost)
    });
}
else {
    logger.info(`Starting INSECURE WebSocket proxy on port ${config.bindPort}...`);
    server = new WebSocketServer({
        port: config.bindPort,
        host: config.bindHost
    });
}
PROXY.wsServer = server;
server.addListener('connection', c => {
    connectionLogger.debug(`[CONNECTION] New inbound WebSocket connection from [/${c._socket.remoteAddress}:${c._socket.remotePort}]. (${c._socket.remotePort} -> ${config.bindPort})`);
    const plr = new ProxiedPlayer();
    plr.ws = c;
    plr.ip = c._socket.remoteAddress;
    plr.remotePort = c._socket.remotePort;
    plr.state = State.PRE_HANDSHAKE;
    plr.queuedEaglerSkinPackets = [];
    c.on('message', msg => {
        handlePacket(msg, plr);
    });
});
server.on('listening', () => {
    logger.info(`Successfully started${config.security.enabled ? " [secure]" : ""} WebSocket proxy on port ${config.bindPort}!`);
});
process.on('uncaughtException', err => {
    var _a;
    logger.error(`An uncaught exception was caught! Exception: ${(_a = err.stack) !== null && _a !== void 0 ? _a : err}`);
});
process.on('unhandledRejection', err => {
    var _a;
    logger.error(`An unhandled promise rejection was caught! Rejection: ${(_a = (err != null ? err.stack : err)) !== null && _a !== void 0 ? _a : err}`);
});
process.on('SIGTERM', () => {
    logger.info("Cleaning up before exiting...");
    for (const [username, plr] of PROXY.players) {
        if (plr.remoteConnection != null)
            plr.remoteConnection.end();
        disconnect(plr, ChatColor.YELLOW + "Proxy is shutting down.");
    }
    process.exit(0);
});
process.on('SIGINT', () => {
    logger.info("Cleaning up before exiting...");
    for (const [username, plr] of PROXY.players) {
        if (plr.remoteConnection != null)
            plr.remoteConnection.end();
        disconnect(plr, ChatColor.YELLOW + "Proxy is shutting down.");
    }
    process.exit(0);
});
