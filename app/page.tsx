"use client"

import { useEffect, useRef, useState } from "react";
import { Application, Graphics } from "pixi.js";
type GameMessage = {
  id: number,
  entry_fee: number,
  players: Player[],
  dots: Dot[],
}
type Player = {
  username: string,
  x: number,
  y: number,
  radius: number
}
type Dot = {
  username: string,
  x: number,
  y: number,
  radius: number,
}
let gameData: GameMessage;
let mouseCoords: [number, number] = [0, 0];
export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const playerRef = useRef<Player | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const [username, setUsername] = useState<string>("");
  const [connected, setConnected] = useState<boolean>(false);
  useEffect(() => {
    const app = new Application();
    appRef.current = app;
    let handler: any;
    (async () => {
      await app.init({
        width: 500,
        height: 500,
        backgroundColor: 0xffffff,
      });

      if (containerRef.current) {
        containerRef.current.appendChild(app.canvas);
      }
      app.canvas.addEventListener("pointermove", (e) => {
        const rect = app.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Relative to player-centered screen
        const centerX = app.screen.width / 2;
        const centerY = app.screen.height / 2;

        const relativeX = mouseX - centerX;
        const relativeY = mouseY - centerY;
        mouseCoords = [relativeX, relativeY];
      });
      animate();
      handler = setInterval(emit, 1000 / 30);
    })();
    return () => {
      app.destroy(true, { children: true });
      clearInterval(handler);
    };
  }, []);
  const emit = () => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      const message = {
        vx: Math.floor(-mouseCoords[0] / 10), // example velocity
        vy: Math.floor(-mouseCoords[1] / 10),
      };
      websocketRef.current.send(JSON.stringify(message));
    }
  }
  const open = () => {
    if (!username) return;
    const websocket = new WebSocket(`${process.env.NEXT_PUBLIC_BACKEND_URL}/ws?username=${username}`)
    websocket.onopen = () => {
      setConnected(true);
      console.log("websocket opened");
    }
    websocket.onerror = (err) => {
      console.error(err);
      console.log({ backend: process.env.NEXT_PUBLIC_BACKEND_URL })
    }
    websocket.onmessage = (event) => {
      const data: GameMessage = JSON.parse(event.data);
      gameData = data;
      playerRef.current = data.players.find(player => player.username === username) || null;
    }
    websocketRef.current = websocket;
  }
  const animate = async () => {
    if (!appRef.current) return;
    const app = appRef.current;
    requestAnimationFrame(animate);

    if (!gameData || !playerRef.current) return; // Ensure gameData and player are available

    // Clear previous frame
    app.stage.removeChildren();

    const player = playerRef.current;
    const centerX = app.canvas.width / 2;
    const centerY = app.canvas.height / 2;
    const gridSpacing = 100;
    const worldSize = 1000;
    const gridGraphics = new Graphics();
    gridGraphics.setStrokeStyle({ width: 1, color: 0xaaaaaa, alpha: 1 });
    gridGraphics.beginPath();
    const offsetX = (Math.floor(player.x) % gridSpacing) - gridSpacing;
    const offsetY = (Math.floor(player.y) % gridSpacing) - gridSpacing;
    const playerY = 1000 - player.y;
    const playerX = 1000 - player.x;

    const yBorderTop = Math.max(app.screen.height / 2 - playerY, 0);
    const xBorderLeft = Math.max(app.screen.width / 2 - playerX, 0);
    const yBorderBottom = Math.min(app.screen.height / 2 + (worldSize - playerY), app.screen.height);
    const xBorderRight = Math.min(app.screen.width / 2 + (worldSize - playerX), app.screen.width);
    for (let x = Math.floor(offsetX); x < app.screen.width; x += gridSpacing) {
      if (x < xBorderLeft || x > xBorderRight) {
        continue;
      }
      gridGraphics.moveTo(x, yBorderTop);
      gridGraphics.lineTo(x, yBorderBottom);
    }
    for (let y = Math.floor(offsetY); y < app.screen.height; y += gridSpacing) {
      if (y < yBorderTop || y > yBorderBottom) {
        continue;
      }
      gridGraphics.moveTo(xBorderLeft, y);
      gridGraphics.lineTo(xBorderRight, y);
    }
    gridGraphics.stroke(); // finalize the path
    app.stage.addChild(gridGraphics);
    const playerGraphics = new Graphics();
    playerGraphics.beginFill(0x00ff00); // Green color
    playerGraphics.drawCircle(centerX, centerY, player.radius);
    playerGraphics.endFill();
    app.stage.addChild(playerGraphics);

    // Draw dots relative to the player
    gameData.dots.forEach((dot) => {
      const dotGraphics = new Graphics();
      const dotX = centerX - (dot.x - player.x); // Adjust dot position relative to player
      const dotY = centerY - (dot.y - player.y); // Adjust dot position relative to player

      dotGraphics.beginFill(0xff0000); // Red color for dots
      dotGraphics.drawCircle(dotX, dotY, dot.radius);
      dotGraphics.endFill();
      app.stage.addChild(dotGraphics);
    });

    // Draw other players relative to the player
    gameData.players.forEach((otherPlayer) => {
      if (otherPlayer.username === player.username) return; // Skip current player

      const otherPlayerGraphics = new Graphics();
      const otherPlayerX = centerX - (otherPlayer.x - player.x); // Adjust other player position relative to player
      const otherPlayerY = centerY - (otherPlayer.y - player.y); // Adjust other player position relative to player

      otherPlayerGraphics.beginFill(0x0000ff); // Blue color for other players
      otherPlayerGraphics.drawCircle(otherPlayerX, otherPlayerY, otherPlayer.radius);
      otherPlayerGraphics.endFill();
      app.stage.addChild(otherPlayerGraphics);
    });
  };
  return (
    <div ref={containerRef} className="relative w-[100vw] h-[100vh]">
      {!connected && (
        <div className="absolute z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-10 border-black border-2 bg-slate-500 rounded-lg flex flex-col justify-center items-center gap-2">
          <p className="text-xl text-white font-bold">Wagr Minigames: Agar</p>
          <input
            type="text"
            className="px-4 py-2 bg-blue-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
            onChange={(event: any) => setUsername(event.target.value)}
            placeholder="username"
          />
          <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition" onClick={open}>
            Connect
          </button>
        </div>
      )}
    </div>
  );
}
