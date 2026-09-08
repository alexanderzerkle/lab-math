const CAT_ASSET_FILES = {
  0: "assets/cat-0-sleeping.b64",
  5: "assets/cat-5-one-eye.b64",
  10: "assets/cat-10-awake.b64",
  15: "assets/cat-15-labcoat.b64",
  20: "assets/cat-20-glassware.b64",
  25: "assets/cat-25-triumphant.b64",
  30: "assets/cat-30-fire.b64"
};

const catAssetCache = new Map();
let catRenderVersion = 0;

async function loadCatAsset(level) {
  const assetLevel = level >= 35 ? 30 : level;

  if (catAssetCache.has(assetLevel)) {
    return catAssetCache.get(assetLevel);
  }

  const response = await fetch(CAT_ASSET_FILES[assetLevel], { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`Could not load cat artwork (${response.status})`);
  }

  const base64 = (await response.text()).trim();
  const dataUrl = `data:image/webp;base64,${base64}`;
  catAssetCache.set(assetLevel, dataUrl);
  return dataUrl;
}

function preloadNextCatLevel(level) {
  const nextLevels = [5, 10, 15, 20, 25, 30];
  const nextLevel = nextLevels.find(candidate => candidate > level);
  if (nextLevel !== undefined) {
    loadCatAsset(nextLevel).catch(() => {});
  }
}

updateCatGraphic = function() {
  const level = getCatLevel(score);
  const renderVersion = ++catRenderVersion;

  catStageEl.classList.toggle("animated-fire", level >= 35);

  loadCatAsset(level)
    .then(dataUrl => {
      if (renderVersion !== catRenderVersion) return;

      const image = new Image();
      image.className = "cat-progress-image";
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      image.decoding = "async";

      image.onload = function() {
        if (renderVersion !== catRenderVersion) return;
        catStageEl.replaceChildren(image);
        catStageEl.classList.add("cat-ready");
        preloadNextCatLevel(level);
      };

      image.onerror = function() {
        console.error("Could not decode cat artwork.");
      };

      image.src = dataUrl;
    })
    .catch(error => {
      console.error("Could not load cat graphic:", error);
    });
};

updateCatGraphic();
