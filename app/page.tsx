"use client"

import { useEffect, useRef, useState } from "react";
import { Application, Graphics, TextStyle, Text } from "pixi.js";
type GameMessage = {
  id: number,
  entry_fee: number,
  players: Player[],
  dots: Dot[],
  virus: Virus[],
}
type Virus = {
  x: number,
  y: number,
  radius: number
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
  emitter?: string,
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
        backgroundColor: 0xffffff,
        resizeTo: window
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
    if (!username) {
      throw new Error("Username not provided");
    }
    console.log("here");
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
    const sw = app.screen.width;
    const sh = app.screen.height;
    const screenCenterX = sw / 2;
    const screenCenterY = sh / 2;

    // ── 1) compute a scale so that the player's radius never exceeds 30% of screen ──
    const maxOnScreenRadius = Math.min(sw, sh) * 0.3;
    const scaleFactor = Math.min(1, maxOnScreenRadius / player.radius);

    // ── 2) pivot & position stage at screen center, then scale ──
    app.stage.pivot.set(screenCenterX, screenCenterY);
    app.stage.position.set(screenCenterX, screenCenterY);
    app.stage.scale.set(scaleFactor);
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
    for (let rawX = Math.floor(offsetX); rawX < app.screen.width; rawX += gridSpacing) {
      if (rawX < xBorderLeft || rawX > xBorderRight) continue;

      // snap to pixel grid
      const x = Math.round(rawX) + 0.5;
      const y0 = Math.round(yBorderTop) + 0.5;
      const y1 = Math.round(yBorderBottom) + 0.5;

      gridGraphics.moveTo(x, y0);
      gridGraphics.lineTo(x, y1);
    }

    for (let rawY = Math.floor(offsetY); rawY < app.screen.height; rawY += gridSpacing) {
      if (rawY < yBorderTop || rawY > yBorderBottom) continue;

      const y = Math.round(rawY) + 0.5;
      const x0 = Math.round(xBorderLeft) + 0.5;
      const x1 = Math.round(xBorderRight) + 0.5;

      gridGraphics.moveTo(x0, y);
      gridGraphics.lineTo(x1, y);
    }
    gridGraphics.stroke(); // finalize the path
    app.stage.addChild(gridGraphics);
    const playerGraphics = new Graphics();
    playerGraphics.beginFill(0x00ff00); // Green color
    playerGraphics.drawCircle(centerX, centerY, player.radius);
    playerGraphics.endFill();
    app.stage.addChild(playerGraphics);
    const style = new TextStyle({ fill: '#000000', fontSize: 14, align: 'center' });
    const mainLabel = new Text(player.username, style);
    mainLabel.x = centerX - mainLabel.width / 2;
    mainLabel.y = centerY + player.radius + 4;
    app.stage.addChild(mainLabel);
    // Draw dots relative to the player

    gameData.dots.forEach((dot) => {
      const dotGraphics = new Graphics();
      const dotX = centerX - (dot.x - player.x);
      const dotY = centerY - (dot.y - player.y);
      // pick color based on emitter
      const fillColor = dot.emitter === player.username ? 0x888888 : 0xff0000;

      dotGraphics.beginFill(fillColor);
      dotGraphics.drawCircle(dotX, dotY, dot.radius);
      dotGraphics.endFill();

      app.stage.addChild(dotGraphics);
    });
    gameData.virus.forEach((v) => {
      const tri = new Graphics();
      const vx = centerX - (v.x - player.x);
      const vy = centerY - (v.y - player.y);
      const r = v.radius;

      // compute the three corners of an equilateral triangle
      const height = Math.sqrt(3) * r;
      const points = [
        vx, vy - (2 / 3) * height,         // top point
        vx - r, vy + (1 / 3) * height,         // bottom-left
        vx + r, vy + (1 / 3) * height          // bottom-right
      ];

      tri.beginFill(0x00aa00);
      tri.drawPolygon(points);
      tri.endFill();

      app.stage.addChild(tri);
    });


    // Draw other players relative to the player
    gameData.players.forEach((other) => {
      if (other.username === player.username) return; // skip self

      const otherX = centerX - (other.x - player.x);
      const otherY = centerY - (other.y - player.y);

      // circle
      const g = new Graphics();
      g.beginFill(0x000000);
      g.drawCircle(otherX, otherY, other.radius);
      g.endFill();
      app.stage.addChild(g);

      // name label
      const label = new Text(other.username, style);
      label.x = otherX - label.width / 2;
      label.y = otherY + other.radius + 4;
      app.stage.addChild(label);
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
