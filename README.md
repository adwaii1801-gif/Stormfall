# Stormfall Royale

A top-down battle royale for the browser. Play solo against bots, or with friends online.

## Run it on your computer

You need Node.js 18 or newer (nodejs.org).

    node server.js

Then open http://localhost:3000. Friends on the same Wi-Fi can join at http://YOUR-COMPUTER-IP:3000.

## Put it online for free (Render)

1. Make a free GitHub account and create a new repository.
2. Upload everything in this folder to it: `server.js`, `package.json`, `README.md` and the `public` folder.
3. Make a free account at render.com and choose **New → Web Service**.
4. Connect your GitHub repository and use these settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `node server.js`
   - Instance type: **Free**
5. Press **Create Web Service**. After a minute or two you get a link like `https://stormfall-royale.onrender.com`.
6. Send that link to your friends. Everyone taps **Play with friends**, and the first person in the lobby is the host who starts the match.

The free plan goes to sleep after about 15 minutes with nobody playing. The first person to open it after that waits up to a minute while it wakes up.

## Private lobbies

Add `?room=` and any code to the link, for example `https://stormfall-royale.onrender.com/?room=squad42`.
Only people with that exact link end up in your lobby. Up to 16 players per lobby.
