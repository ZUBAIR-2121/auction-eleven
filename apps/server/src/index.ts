import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@auction-eleven/shared";
import { FOOTBALLERS, FOOTBALLER_BY_ID } from "./footballers.js";
import { getFootballerPhoto } from "./photoResolver.js";
import { RoomManager } from "./roomManager.js";

const PORT=Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN=process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const app=express();
app.disable("x-powered-by");
app.use(cors({origin:CLIENT_ORIGIN,credentials:true}));
app.use(express.json({limit:"20kb"}));
app.get("/health",(_req,res)=>res.json({ok:true,service:"auction-eleven-server",players:FOOTBALLERS.length}));
app.get("/api/footballers",(_req,res)=>res.json({footballers:FOOTBALLERS}));
app.get("/api/footballers/:id/photo",async(req,res)=>{
  const player=FOOTBALLER_BY_ID.get(req.params.id);
  if(!player){res.status(404).json({error:"Footballer not found."});return;}
  try{
    const photo=await getFootballerPhoto(player);
    res.set("Cache-Control","public, max-age=86400, stale-while-revalidate=604800");
    res.json(photo);
  }catch(error){
    res.status(404).json({error:error instanceof Error?error.message:"Photo could not be resolved."});
  }
});

const server=http.createServer(app);
const io=new Server<ClientToServerEvents,ServerToClientEvents>(server,{cors:{origin:CLIENT_ORIGIN,credentials:true},pingInterval:10000,pingTimeout:12000,maxHttpBufferSize:100_000});
const rooms=new RoomManager(
  (socketId,state)=>io.to(socketId).emit("room:state",state),
  (code,payload)=>io.to(code).emit("room:reaction",payload),
  ()=>io.emit("rooms:changed"),
  (code,patch)=>io.to(code).emit("room:auctionPatch",patch)
);

const safeAck=(ack:Function,fn:()=>unknown)=>{
  try{ack({ok:true,data:fn()})}
  catch(error){
    const message=error instanceof Error?error.message:"Unexpected server error.";
    console.warn(JSON.stringify({level:"warn",event:"socket_request_rejected",message}));
    ack({ok:false,error:message});
  }
};

io.on("connection",socket=>{
  let managerId:string|null=null;
  let roomCode:string|null=null;
  const ensureSeat=(code:string)=>{
    if(!managerId)throw new Error("Join a room first.");
    rooms.assertSocketOwner(code,managerId,socket.id);
    return managerId;
  };
  socket.on("room:create",(payload,ack)=>safeAck(ack,()=>{const result=rooms.create(payload.name,payload.sessionId,socket.id,!!payload.solo,payload.access,payload.password);managerId=result.managerId;roomCode=result.code;socket.join(result.code);socket.emit("room:state",rooms.getState(result.code,result.managerId));return result;}));
  socket.on("room:join",(payload,ack)=>safeAck(ack,()=>{const result=rooms.join(payload.code,payload.name,payload.sessionId,socket.id,payload.password);managerId=result.managerId;roomCode=result.code;socket.join(result.code);socket.emit("room:state",rooms.getState(result.code,result.managerId));return result;}));
  socket.on("rooms:list",(payload,ack)=>safeAck(ack,()=>rooms.listRooms(payload.filters)));
  socket.on("room:resume",(payload,ack)=>safeAck(ack,()=>{const result=rooms.resume(payload.code,payload.sessionId,socket.id);managerId=result.managerId;roomCode=payload.code.toUpperCase();socket.join(roomCode);socket.emit("room:state",rooms.getState(roomCode,result.managerId));return result;}));
  socket.on("room:leave",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.leave(payload.code,seat);socket.leave(payload.code.toUpperCase());managerId=null;roomCode=null;return null;}));
  socket.on("room:replaceWithAI",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.replaceWithAI(payload.code,seat,payload.managerId);return null;}));
  socket.on("room:ready",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.setReady(payload.code,seat,payload.ready);return null;}));
  socket.on("room:updateSettings",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.updateSettings(payload.code,seat,payload.settings);return null;}));
  socket.on("room:updateAccess",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.updateAccess(payload.code,seat,payload.access,payload.password);return null;}));
  socket.on("room:updatePlayerPool",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.updatePlayerPool(payload.code,seat,payload.selectedFootballerIds);return null;}));
  socket.on("room:autoBuildPlayerPool",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.autoBuildPlayerPool(payload.code,seat);return null;}));
  socket.on("game:start",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.start(payload.code,seat);return null;}));
  socket.on("game:quitSolo",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.quitSolo(payload.code,seat);managerId=null;roomCode=null;return null;}));
  socket.on("auction:bid",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.bid(payload.code,seat,payload.amount,payload.requestId,payload.roundId);return null;}));
  socket.on("auction:pass",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.pass(payload.code,seat,payload.roundId);return null;}));
  socket.on("auction:complete",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.completeAuction(payload.code,seat);return null;}));
  socket.on("lineup:submit",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.submitLineup(payload.code,seat,payload.formationId,payload.picks);return null;}));
  socket.on("room:reaction",payload=>{try{const seat=ensureSeat(payload.code);rooms.reaction(payload.code,seat,payload.reaction);}catch{/* ignore stale/invalid reaction events */}});
  socket.on("chat:send",(payload,ack)=>safeAck(ack,()=>{const seat=ensureSeat(payload.code);rooms.sendChat(payload.code,seat,payload.text);return null;}));
  socket.on("chat:typing",payload=>{try{const seat=ensureSeat(payload.code);const typing=rooms.typing(payload.code,seat,payload.isTyping);socket.to(payload.code.toUpperCase()).emit("chat:typing",typing);}catch{/* ignore stale typing events */}});
  socket.on("disconnect",()=>rooms.disconnect(socket.id));
});

if(process.env.NODE_ENV==="production"){
  const here=path.dirname(fileURLToPath(import.meta.url));
  const webDist=path.resolve(here,"../../web/dist");
  app.use(express.static(webDist));
  app.use((_req,res)=>res.sendFile(path.join(webDist,"index.html")));
}
server.listen(PORT,()=>console.log(`Auction Eleven server running on http://localhost:${PORT}`));
