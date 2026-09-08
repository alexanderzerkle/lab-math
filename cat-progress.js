const CAT_ASSET_FILES = {
  0: "assets/cat-0-sleeping.png",
  5: "assets/cat-5-one-eye.png",
  10: "assets/cat-10-awake.png",
  15: "assets/cat-15-labcoat.png",
  20: "assets/cat-20-glassware.png",
  25: "assets/cat-25-triumphant.png",
  30: "assets/cat-30-fire.png"
};

const catAssetCache = new Map();
let catRenderVersion = 0;

function getCatAssetLevel(level) {
  return level >= 35 ? 30 : level;
}

function getCatAssetPath(level) {
  return CAT_ASSET_FILES[getCatAssetLevel(level)];
}

function preloadCatAsset(level) {
  const assetLevel = getCatAssetLevel(level);

  if (catAssetCache.has(assetLevel)) {
    return catAssetCache.get(assetLevel);
  }

  const image = new Image();
  image.decoding = "async";
  image.src = CAT_ASSET_FILES[assetLevel];
  catAssetCache.set(assetLevel, image);
  return image;
}

function preloadNextCatLevel(level) {
  const nextLevels = [5, 10, 15, 20, 25, 30];
  const nextLevel = nextLevels.find(candidate => candidate > level);

  if (nextLevel !== undefined) {
    preloadCatAsset(nextLevel);
  }
}

function updateCatGraphic() {
  const level = getCatLevel(score);
  const renderVersion = ++catRenderVersion;
  const assetPath = getCatAssetPath(level);

  catStageEl.classList.toggle("animated-fire", level >= 35);
  catStageEl.classList.remove("cat-ready");

  const image = new Image();
  image.className = "cat-progress-image";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.decoding = "async";

  image.onload = function() {
    if (renderVersion !== catRenderVersion) return;

    catStageEl.replaceChildren(image);
    catStageEl.classList.add("cat-ready");
    catAssetCache.set(getCatAssetLevel(level), image);
    preloadNextCatLevel(level);
  };

  image.onerror = function() {
    console.error(`Could not load cat artwork: ${assetPath}`);
    if (renderVersion === catRenderVersion) {
      catStageEl.classList.remove("cat-ready");
    }
  };

  image.src = assetPath;
}

Object.keys(CAT_ASSET_FILES).forEach(level => {
  preloadCatAsset(Number(level));
});

updateCatGraphic();
