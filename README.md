# Endless Worldle (Unlimited Guesses)

Mobile-friendly Worldle-style game:
- Country silhouette guessing
- Unlimited guesses
- Endless rounds
- Distance + direction + proximity bar
- On-screen keyboard
- Stats + streaks (localStorage)
- Offline / installable (PWA)

## REQUIRED: Add the dataset
This project expects this file:

`data/countries-110m.json`

Download it from world-atlas and place it into `data/`:
- https://unpkg.com/world-atlas@2/countries-110m.json

Save it as: `countries-110m.json`

## Run locally
### Option A: VS Code Live Server
1. Install the "Live Server" extension in VS Code
2. Right-click `index.html` -> "Open with Live Server"

### Option B: Python
```bash
python -m http.server 8080
```
Then open: http://localhost:8080

## Deploy on GitHub Pages
1. Create a GitHub repo (public is easiest) and upload these files.
2. Repo Settings -> Pages
3. Source: Deploy from a branch
4. Branch: main, Folder: / (root)
5. Your site will be at:
   https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
