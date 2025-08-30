const Models = ["Mug", "Shirt", "Cap", "Poster"];
let SELECTED_MODEL = "Mug";
let SelectedCustomization = "Image";
let ProductColor = "#ffffff";
let AnimatedCanvas = true;
let IniModel = true;

let Loading = false;

// ONNX Model for background removal
let onnxSession = null;
let isModelLoaded = false;

// Load ONNX.js library and initialize model
async function loadONNXModel() {
  try {
    // Load ONNX.js library dynamically
    if (!window.ort) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js';
      document.head.appendChild(script);

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
    }

    // Initialize ONNX Runtime
    onnxSession = await ort.InferenceSession.create('./modnet_webcam_human_seg.onnx');
    isModelLoaded = true;
    console.log('ONNX model loaded successfully');
  } catch (error) {
    console.error('Failed to load ONNX model:', error);
  }
}

// Initialize the model when the page loads
loadONNXModel();

// Function to remove background using ONNX model
async function removeBackgroundWithONNX(imageUrl) {
  if (!isModelLoaded || !onnxSession) {
    throw new Error('ONNX model not loaded');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      try {
        // Create canvas for image processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Resize image to model input size (512x512 for MODNet)
        canvas.width = 512;
        canvas.height = 512;
        ctx.drawImage(img, 0, 0, 512, 512);

        // Get image data and convert to tensor format
        const imageData = ctx.getImageData(0, 0, 512, 512);
        const rgbData = new Float32Array(3 * 512 * 512);

        // Convert RGBA to RGB and normalize to [-1, 1]
        for (let i = 0; i < imageData.data.length; i += 4) {
          const pixelIndex = i / 4;
          rgbData[pixelIndex] = (imageData.data[i] / 255.0) * 2 - 1;     // R
          rgbData[pixelIndex + 512 * 512] = (imageData.data[i + 1] / 255.0) * 2 - 1; // G
          rgbData[pixelIndex + 2 * 512 * 512] = (imageData.data[i + 2] / 255.0) * 2 - 1; // B
        }

        // Create input tensor
        const inputTensor = new ort.Tensor('float32', rgbData, [1, 3, 512, 512]);

        // Run inference
        const results = await onnxSession.run({ input: inputTensor });
        const mask = results.output;

        // Process mask and apply to original image
        const processedImageUrl = await applyMaskToImage(img, mask.data, 512, 512);
        resolve(processedImageUrl);

      } catch (error) {
        console.error('Background removal failed:', error);
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

// Function to apply mask to the original image
async function applyMaskToImage(originalImg, maskData, maskWidth, maskHeight) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas size to original image size
  canvas.width = originalImg.naturalWidth;
  canvas.height = originalImg.naturalHeight;

  // Draw original image
  ctx.drawImage(originalImg, 0, 0);

  // Get image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Create a temporary canvas for resized mask
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;

  // Convert mask data to ImageData and resize
  const maskImageData = new ImageData(maskWidth, maskHeight);
  for (let i = 0; i < maskData.length; i++) {
    const value = Math.max(0, Math.min(255, maskData[i] * 255));
    maskImageData.data[i * 4] = value;     // R
    maskImageData.data[i * 4 + 1] = value; // G  
    maskImageData.data[i * 4 + 2] = value; // B
    maskImageData.data[i * 4 + 3] = 255;   // A
  }

  // Put mask data and resize it
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = maskWidth;
  tempCanvas.height = maskHeight;
  tempCtx.putImageData(maskImageData, 0, 0);

  // Draw resized mask
  maskCtx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
  const resizedMaskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);

  // Apply mask to remove background
  for (let i = 0; i < pixels.length; i += 4) {
    const maskValue = resizedMaskData.data[i] / 255; // Use red channel as mask
    pixels[i + 3] = Math.round(pixels[i + 3] * maskValue); // Apply to alpha channel
  }

  // Put the modified image data back
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}

const Canvas = document.querySelector("#canvas");
Canvas.src = `https://3d-config-seven.vercel.app/?model=${SELECTED_MODEL}`;

// enable loading anim
document.querySelector(".loading-indicator").style.display = "block";

let selectedText = false;
let selectedImage = false;

const Images = [];
const Texts = [];

//  text sliders
const size_slider = document.querySelector("#text-customization #size-slider");
const X_slider = document.querySelector("#text-customization #x-position");
const Y_slider = document.querySelector("#text-customization #y-position");
const rot_slider = document.querySelector(
  "#text-customization #rotation-slider"
);
const line_height_slider = document.querySelector(
  "#text-customization #line-height-slider"
);

//  image sliders
const size_slider_image = document.querySelector(
  "#image-customization #size-slider"
);
const X_slider_image = document.querySelector(
  "#image-customization #x-position"
);
const Y_slider_image = document.querySelector(
  "#image-customization #y-position"
);
const rot_slider_image = document.querySelector(
  "#image-customization #rotation-slider"
);

const loadingIndicator = document.querySelector(".loading-indicator");
const progressText = document.getElementById("loading-progress");
let progress = 0;
let progressInterval;

function startLoadingProgress() {
  progress = 0;
  progressText.textContent = "0%";
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (progress < 95) { // stop at 95%, final 100% comes on iframe load
      progress += 5;
      progressText.textContent = progress + "%";
    }
  }, 200);
}

function stopLoadingProgress() {
  clearInterval(progressInterval);
  progress = 100;
  progressText.textContent = "100%";
  setTimeout(() => {
    loadingIndicator.style.display = "none";
  }, 300);
}

// enable loading anim
loadingIndicator.style.display = "block";
startLoadingProgress();

Canvas.addEventListener("load", () => {
  stopLoadingProgress();
  if (!IniModel) {
    setTimeout(() => {
      postToIframe({
        type: "ini-layers",
        payload: { textLayers: Texts, imageLayers: Images },
      });
    }, 1000);
  }
});

const previewLoading = document.getElementById("preview-loading");
const previewImg = document.getElementById("mug-2d-preview");
const overlayImg = document.querySelector('img[alt="Mug layout"]');

function showPreviewLoading() {
  previewLoading.style.display = "flex";
}

function hidePreviewLoading() {
  previewLoading.style.display = "none";
}

// Attach load listeners
previewImg.onload = hidePreviewLoading;
overlayImg.onload = hidePreviewLoading;


// Map each model to its 2D preview image
// Map each model to its preview image and styles
const model2DConfigs = {
  Mug: {
    preview: "Damn - Digital Hub_files/Layout_Mug.png",
    previewStyle: {
      position: "absolute",
      maxWidth: "82%",
      top:"23%",
      left:"9%",
      cursor: "grab",
      border: "1px dashed #aaa",
      borderRadius: "0px",
      zIndex: "1"
    },
    overlayStyle: {
      position: "relative",
      maxWidth: "100%",
      pointerEvents: "none",
      zIndex: "2"
    }
  },
  Shirt: {
    preview: "Damn - Digital Hub_files/Layout_Shirt.png",
    previewStyle: {
      position: "absolute",
      maxWidth: "25%",
      top:"35%",
      left:"38%",
      cursor: "grab",
      border: "1px dashed #aaa",
      borderRadius: "8px",
      zIndex: "1"
    },
    overlayStyle: {
      position: "relative",
      maxWidth: "100%",
      pointerEvents: "none",
      zIndex: "2"
    }
  },
  Cap: {
    preview: "Damn - Digital Hub_files/Layout_Cap.png",
    previewStyle: {
      position: "absolute",
      maxWidth: "60%",
      top:"26%",
      left:"22%",
      cursor: "grab",
      border: "1px dashed #aaa",
      borderRadius: "8px",
      zIndex: "1"
    },
    overlayStyle: {
      position: "relative",
      maxWidth: "100%",
      pointerEvents: "none",
      zIndex: "2"
    }
  },
  Poster: {
    preview: "Damn - Digital Hub_files/Layout_Poster.png",
    previewStyle: {
      position: "absolute",
      maxWidth: "82%",
      top:"14%",
      left:"9%",
      cursor: "grab",
      border: "1px dashed #aaa",
      borderRadius: "0px",
      zIndex: "1"
    },
    overlayStyle: {
      position: "relative",
      maxWidth: "100%",
      pointerEvents: "none",
      zIndex: "2"
    }
    }
};


document.querySelector(".product-buttons").addEventListener("click", (e) => {
  const newModel = e.target.getAttribute("data-product");

  if (SELECTED_MODEL !== newModel) {
    // Reset UI state
    AnimatedCanvas = true;
    const btn = document.getElementById("auto-rotate-btn");
    btn.classList.add("active");
    btn.textContent = "Stop Rotate";

    IniModel = false;
    SELECTED_MODEL = newModel;

    // ✅ Tell iframe to clear layers first
    postToIframe({ type: "clear-layers" });

    // Clear text layers only - preserve images
    Texts.length = 0;
    document.querySelector(".text_layers").innerHTML = "";

    // Clear UI selections
    selectedText = false;
    selectedImage = false;
    document.querySelector(".selected_layer")?.classList.remove("selected_layer");


    // Set slider ranges depending on product ...
      if (SELECTED_MODEL === "Mug") {
        const container = document.querySelector("#iframe_div");
        const rect = container.getBoundingClientRect();

        size_slider_image.min = 0;   // minimum zoom
        size_slider_image.max = 900;  // maximum zoom
        size_slider_image.value = 1200; // starting zoom

        X_slider_image.min = -1500;
        X_slider_image.max = 1500;
        Y_slider_image.min = -1500;
        Y_slider_image.max = 1500;

        X_slider.min = -1500;
        X_slider.max = 1500;
        Y_slider.min = -1500;
        Y_slider.max = 1500;
      }
else if (SELECTED_MODEL === "Shirt") {
  size_slider_image.min = 50;   // minimum zoom
  size_slider_image.max = 1500;  // maximum zoom
  size_slider_image.value = 800; // starting zoom

  X_slider_image.min = -2000;
  X_slider_image.max = 2000;
  Y_slider_image.min = -2000;
  Y_slider_image.max = 2000;
    } else if (SELECTED_MODEL === "Cap") {
  size_slider_image.min = 0;   // minimum zoom
    size_slider_image.max = 900;  // maximum zoom
    size_slider_image.value = 1200; // starting zoom

    X_slider_image.min = -1500;
    X_slider_image.max = 1500;
    Y_slider_image.min = -1500;
    Y_slider_image.max = 1500;

    X_slider.min = -1500;
    X_slider.max = 1500;
    Y_slider.min = -1500;
    Y_slider.max = 1500;
  } else if (SELECTED_MODEL === "Poster") {
      // Poster-specific slider ranges for image positioning
      size_slider_image.min = 50;   // minimum zoom
      size_slider_image.max = 1500;  // maximum zoom
      size_slider_image.value = 800; // starting zoom

      X_slider_image.min = -2000;
      X_slider_image.max = 2000;
      Y_slider_image.min = -2000;
      Y_slider_image.max = 2000;

      // Text positioning for Poster
  size_slider_image.min = 50;   // minimum zoom
  size_slider_image.max = 1500;  // maximum zoom
  size_slider_image.value = 800; // starting zoom

  X_slider_image.min = -2000;
  X_slider_image.max = 2000;
  Y_slider_image.min = -2000;
  Y_slider_image.max = 2000;
    }

    // Reload the iframe
    Canvas.src = `https://3d-config-seven.vercel.app/?model=${SELECTED_MODEL}`;
    document.querySelector(".loading-indicator").style.display = "block";

    // ✅ Update 2D preview according to selected model
const config = model2DConfigs[newModel];
    const previewImg = document.getElementById("mug-2d-preview");
    const overlayImg = document.querySelector('img[alt="Mug layout"]');

    // Show loading before swapping previews
    showPreviewLoading();
    
    if (config && previewImg) {
      Object.assign(previewImg.style, config.previewStyle);
      //previewImg.src = config.preview;
    }
    
    if (config && overlayImg) {
      Object.assign(overlayImg.style, config.overlayStyle);
      overlayImg.src = config.preview;
    }


    // reload iframe (already in your code)
    Canvas.src = `https://3d-config-seven.vercel.app/?model=${SELECTED_MODEL}`;
    document.querySelector(".loading-indicator").style.display = "block";
  }
});



const TextMessageWrapper = (func) => {
  if (selectedText === false) {
    !notifications.showing &&
      notifications.show("Please Select a layer", "error");
  } else if (Texts[selectedText].locked) {
    !notifications.showing && notifications.show("Layer is Locked!", "error");
  } else {
    func();
  }
};

const ImageMessageWrapper = (func) => {
  if (selectedImage === false) {
    !notifications.showing &&
      notifications.show("Please Select a layer", "error");
  } else if (Images[selectedImage].locked) {
    !notifications.showing && notifications.show("Layer is Locked!", "error");
  } else {
    func();
  }
};

document
  .querySelector(".customization-buttons")
  .addEventListener("click", (e) => {
    if (SelectedCustomization !== e.target.innerText) {
      if (SelectedCustomization === "Image") {
        document.querySelector("#image-customization").style.display = "none";
        document.querySelector("#text-customization").style.display = "block";
      } else {
        document.querySelector("#image-customization").style.display = "block";
        document.querySelector("#text-customization").style.display = "none";
      }

      document
        .querySelector(".customization-buttons>button.active")
        .classList.remove("active");
      SelectedCustomization = e.target.innerText;
      e.target.classList.add("active");
    }
  });

// add text Layer to dom
const CreateTextLayer = (text, id) => {
  // Create the main container
  const textLayer = document.createElement("div");
  textLayer.setAttribute("data-id", id);
  textLayer.className = "text_layer";

  textLayer.onclick = function () {
    postToIframe({ type: "select-layer", payload: { _id: id } });
  };

  // Create the inner container with flex row
  const flexRow = document.createElement("div");
  flexRow.style.display = "flex";
  flexRow.style.flexDirection = "row";
  flexRow.style.alignItems = "center";
  flexRow.style.gap = "8px";

  // Create the first SVG
  const svg1 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg1.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg1.setAttribute("width", "18");
  svg1.setAttribute("height", "18");
  svg1.setAttribute("viewBox", "0 0 21 24");
  svg1.setAttribute("fill", "none");
  svg1.setAttribute("stroke", "#000000");

  const path1_1 = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  path1_1.setAttribute("d", "M7.66406 20.125H15.3307");
  path1_1.setAttribute("stroke", "inherit");
  path1_1.setAttribute("stroke-width", "2");
  path1_1.setAttribute("stroke-linecap", "round");
  path1_1.setAttribute("stroke-linejoin", "round");

  const path1_2 = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  path1_2.setAttribute("d", "M11.5 2.875V20.125");
  path1_2.setAttribute("stroke", "inherit");
  path1_2.setAttribute("stroke-width", "2");
  path1_2.setAttribute("stroke-linecap", "round");
  path1_2.setAttribute("stroke-linejoin", "round");

  const path1_3 = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  path1_3.setAttribute(
    "d",
    "M3.83203 7.66667V5.75C3.83203 4.9875 4.13493 4.25624 4.6741 3.71707C5.21327 3.1779 5.94453 2.875 6.70703 2.875H16.2904C17.0529 2.875 17.7841 3.1779 18.3233 3.71707C18.8625 4.25624 19.1654 4.9875 19.1654 5.75V7.66667"
  );
  path1_3.setAttribute("stroke", "inherit");
  path1_3.setAttribute("stroke-width", "2");
  path1_3.setAttribute("stroke-linecap", "round");
  path1_3.setAttribute("stroke-linejoin", "round");

  svg1.appendChild(path1_1);
  svg1.appendChild(path1_2);
  svg1.appendChild(path1_3);

  // Create the span
  const span = document.createElement("span");
  span.textContent = text.slice(0, 15);

  // Append svg and span to the flex row
  flexRow.appendChild(svg1);
  flexRow.appendChild(span);

  // Create a wrapper for the buttons (bin and your new SVG)
  const buttonWrapper = document.createElement("div");
  buttonWrapper.style.display = "flex";
  buttonWrapper.style.alignItems = "center";
  buttonWrapper.style.gap = "8px";

  // === Delete Button
  const deleteButton = document.createElement("button");
  deleteButton.style.border = "none";
  deleteButton.style.background = "transparent";
  deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M20 7H4M18 10L17.33 17.36C17.24 18.36 16.78 19.28 16.04 19.96C15.3 20.63 14.33 21 13.33 21H10.63C9.63 21 8.66 20.63 7.92 19.96C7.18 19.28 6.72 18.36 6.63 17.36L6 10M10 12V15M13.99 12V15M16.5 7H7.5L8 4.89C8.13 4.34 8.45 3.86 8.89 3.52C9.34 3.17 9.89 2.99 10.45 3H13.55C14.11 2.99 14.66 3.17 15.11 3.52C15.55 3.86 15.87 4.34 16 4.89L16.5 7Z" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  deleteButton.onclick = () => {
    const index = Texts.findIndex((ele) => ele._id == id);
    Texts.splice(index, 1);
    textLayer.remove();
    notifications.show("Layer Deleted!", "success");
    postToIframe({ type: "delete-layer", payload: { _id: id } });
  };

  // === Lock Button
  const lockButton = document.createElement("button");
  lockButton.style.border = "none";
  lockButton.style.background = "transparent";

  const lockIcon = (locked) => {
    return locked
      ? `<svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M16.584 6C15.8124 4.2341 14.0503 3 12 3C9.23858 3 7 5.23858 7 8V10.0288M12 14.5V16.5M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C16.8802 10 17.7202 10 18.362 10.327C18.9265 10.6146 19.3854 11.0735 19.673 11.638C20 12.2798 20 13.1198 20 14.8V16.2C20 17.8802 20 18.7202 19.673 19.362C19.3854 19.9265 18.9265 20.3854 18.362 20.673C17.7202 21 16.8802 21 15.2 21H8.8C7.11984 21 6.27976 21 5.63803 20.673C5.07354 20.3854 4.6146 19.9265 4.32698 19.362C4 18.7202 4 17.8802 4 16.2V14.8C4 13.1198 4 12.2798 4.32698 11.638C4.6146 11.0735 5.07354 10.6146 5.63803 10.327C5.99429 10.1455 6.41168 10.0647 7 10.0288Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>`
      : `<svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M12 14.5V16.5M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C15.9474 10 16.5286 10 17 10.0288M7 10.0288C6.41168 10.0647 5.99429 10.1455 5.63803 10.327C5.07354 10.6146 4.6146 11.0735 4.32698 11.638C4 12.2798 4 13.1198 4 14.8V16.2C4 17.8802 4 18.7202 4.32698 19.362C4.6146 19.9265 5.07354 20.3854 5.63803 20.673C6.27976 21 7.11984 21 8.8 21H15.2C16.8802 21 17.7202 21 18.362 20.673C18.9265 20.3854 19.3854 19.9265 19.673 19.362C20 18.7202 20 17.8802 20 16.2V14.8C20 13.1198 20 12.2798 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C18.0057 10.1455 17.5883 10.0647 17 10.0288M7 10.0288V8C7 5.23858 9.23858 3 12 3C14.7614 3 17 5.23858 17 8V10.0288" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>`;
  };

  let isLocked = false;
  lockButton.innerHTML = lockIcon(isLocked);
  lockButton.onclick = () => {
    isLocked = !isLocked;
    lockButton.innerHTML = lockIcon(isLocked);
    const index = Texts.findIndex((ele) => ele._id == id);
    if (index >= 0) {
      Texts[index].locked = isLocked;
      notifications.show(
        isLocked ? "Layer locked!" : "Layer unlocked",
        "success"
      );
      postToIframe({
        type: "lock-layer",
        payload: { _id: id, lock: isLocked },
      });
    }
  };

  // === Append both buttons to wrapper
  buttonWrapper.appendChild(deleteButton);
  buttonWrapper.appendChild(lockButton);

  // === Append everything to main container
  textLayer.appendChild(flexRow);
  textLayer.appendChild(buttonWrapper);

  // Finally, append to body or any container
  document.querySelector(".text_layers").appendChild(textLayer);
};

const CreateImageLayer = (url, id) => {
  // Main image layer container
  const imageLayer = document.createElement("div");
  imageLayer.setAttribute("data-id", id);
  imageLayer.className = "image_layer";

  imageLayer.onclick = function () {
    postToIframe({ type: "select-layer", payload: { _id: id } });
  };

  // Wrapper for image and icon
  const flexRow = document.createElement("div");
  flexRow.style.display = "flex";
  flexRow.style.alignItems = "center";
  flexRow.style.gap = "8px";

  // Image icon (your static SVG)
  const imageIcon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );
  imageIcon.setAttribute("viewBox", "0 0 32 32");
  imageIcon.setAttribute("width", "20");
  imageIcon.setAttribute("height", "20");
  imageIcon.setAttribute("fill", "#000000");
  imageIcon.innerHTML = `
    <g transform="translate(-360.000000, -99.000000)" fill="#000000">
      <path d="M368,109 C366.896,109 366,108.104 366,107 C366,105.896 366.896,105 368,105 C369.104,105 370,105.896 370,107 C370,108.104 369.104,109 368,109 Z M368,103 C365.791,103 364,104.791 364,107 C364,109.209 365.791,111 368,111 C370.209,111 372,109.209 372,107 C372,104.791 370.209,103 368,103 Z M390,116.128 L384,110 L374.059,120.111 L370,116 L362,123.337 L362,103 C362,101.896 362.896,101 364,101 L388,101 C389.104,101 390,101.896 390,103 L390,116.128 Z M390,127 C390,128.104 389.104,129 388,129 L382.832,129 L375.464,121.535 L384,112.999 L390,116.128 L390,116.128 Z M364,129 C362.896,129 362,128.104 362,127 L362,126.061 L369.945,118.945 L380.001,129 L364,129 Z M388,99 L364,99 C361.791,99 360,100.791 360,103 L360,127 C360,129.209 361.791,131 364,131 L388,131 C390.209,131 392,129.209 392,127 L392,103 C392,100.791 390.209,99 388,99 Z"/>
    </g>
  `;

  // Thumbnail image
  const img = document.createElement("img");
  img.src = url;
  img.width = 20;
  img.height = 20;
  img.style.borderRadius = "5px";

  flexRow.appendChild(imageIcon);
  flexRow.appendChild(img);

  // === Buttons
  const buttonWrapper = document.createElement("div");
  buttonWrapper.style.display = "flex";
  buttonWrapper.style.alignItems = "center";
  buttonWrapper.style.gap = "8px";

  // === Delete Button
  const deleteButton = document.createElement("button");
  deleteButton.style.border = "none";
  deleteButton.style.background = "transparent";
  deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M20 7H4M18 10L17.33 17.36C17.24 18.36 16.78 19.28 16.04 19.96C15.3 20.63 14.33 21 13.33 21H10.63C9.63 21 8.66 20.63 7.92 19.96C7.18 19.28 6.72 18.36 6.63 17.36L6 10M10 12V15M13.99 12V15M16.5 7H7.5L8 4.89C8.13 4.34 8.45 3.86 8.89 3.52C9.34 3.17 9.89 2.99 10.45 3H13.55C14.11 2.99 14.66 3.17 15.11 3.52C15.55 3.86 15.87 4.34 16 4.89L16.5 7Z" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  deleteButton.onclick = () => {
    const index = Images.findIndex((ele) => ele._id == id);
    Images.splice(index, 1);
    imageLayer.remove();
    notifications.show("Layer Deleted!", "success");
    postToIframe({ type: "delete-layer", payload: { _id: id } });
  };

  // === Lock Button
  const lockButton = document.createElement("button");
  lockButton.style.border = "none";
  lockButton.style.background = "transparent";

  const lockIcon = (locked) => {
    return locked
      ? `<svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M16.584 6C15.8124 4.2341 14.0503 3 12 3C9.23858 3 7 5.23858 7 8V10.0288M12 14.5V16.5M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C16.8802 10 17.7202 10 18.362 10.327C18.9265 10.6146 19.3854 11.0735 19.673 11.638C20 12.2798 20 13.1198 20 14.8V16.2C20 17.8802 20 18.7202 19.673 19.362C19.3854 19.9265 18.9265 20.3854 18.362 20.673C17.7202 21 16.8802 21 15.2 21H8.8C7.11984 21 6.27976 21 5.63803 20.673C5.07354 20.3854 4.6146 19.9265 4.32698 19.362C4 18.7202 4 17.8802 4 16.2V14.8C4 13.1198 4 12.2798 4.32698 11.638C4.6146 11.0735 5.07354 10.6146 5.63803 10.327C5.99429 10.1455 6.41168 10.0647 7 10.0288Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>`
      : `<svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M12 14.5V16.5M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C15.9474 10 16.5286 10 17 10.0288M7 10.0288C6.41168 10.0647 5.99429 10.1455 5.63803 10.327C5.07354 10.6146 4.6146 11.0735 4.32698 11.638C4 12.2798 4 13.1198 4 14.8V16.2C4 17.8802 4 18.7202 4.32698 19.362C4.6146 19.9265 5.07354 20.3854 5.63803 20.673C6.27976 21 7.11984 21 8.8 21H15.2C16.8802 21 17.7202 21 18.362 20.673C18.9265 20.3854 19.3854 19.9265 19.673 19.362C20 18.7202 20 17.8802 20 16.2V14.8C20 13.1198 20 12.2798 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C18.0057 10.1455 17.5883 10.0647 17 10.0288M7 10.0288V8C7 5.23858 9.23858 3 12 3C14.7614 3 17 5.23858 17 8V10.0288" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>`;
  };

  let isLocked = false;
  lockButton.innerHTML = lockIcon(isLocked);
  lockButton.onclick = () => {
    isLocked = !isLocked;
    lockButton.innerHTML = lockIcon(isLocked);
    const index = Images.findIndex((ele) => ele._id == id);
    if (index >= 0) {
      Images[index].locked = isLocked;
      notifications.show(
        isLocked ? "Layer locked!" : "Layer unlocked",
        "success"
      );
      postToIframe({
        type: "lock-layer",
        payload: { _id: id, lock: isLocked },
      });
    }
  };

  // Append buttons
  buttonWrapper.appendChild(deleteButton);
  buttonWrapper.appendChild(lockButton);

  // Combine all into imageLayer
  imageLayer.appendChild(flexRow);
  imageLayer.appendChild(buttonWrapper);

  // Append to container
  document.querySelector(".image_layers").appendChild(imageLayer);
};

// Add text Layer
document.querySelector("#add_text").addEventListener("click", () => {
  const inputElement = document.querySelector("#add_text_inp");
  const textValue = inputElement.value.trim();

  if (textValue) {
    const textObject = {
      text: textValue,
      fontSize: 2,
      left: parseFloat(document.querySelector("#x-position").value),
      top: parseFloat(document.querySelector("#y-position").value),
      rotation: parseFloat(document.querySelector("#rotation-slider").value),
      _id: crypto.randomUUID(),
    };

    Texts.push(textObject);

    postToIframe({
      type: "add-text",
      payload: textObject,
    });

    inputElement.value = "";
    CreateTextLayer(textObject.text, textObject._id);
  }
});

// Update Font Size
size_slider.addEventListener("input", (e) => {
  TextMessageWrapper(() => {
    Texts[selectedText].fontSize = e.target.value;
    updateText({ fontSize: e.target.value });
  });
});

//  update Font postion
X_slider.addEventListener("input", (e) => {
  TextMessageWrapper(() => {
    Texts[selectedText].left = e.target.value;
    updateText({ left: Texts[selectedText].left });
  });
});

Y_slider.addEventListener("input", (e) => {
  TextMessageWrapper(() => {
    Texts[selectedText].top = e.target.value;
    updateText({ top: Texts[selectedText].top });
  });
});

//  update text rotation
rot_slider.addEventListener("input", (e) => {
  TextMessageWrapper(() => {
    const newValue = parseInt(e.target.value);
    const selectedObj = Texts[selectedText];

    // Initialize if not set
    if (selectedObj.prevRotation === undefined) {
      selectedObj.prevRotation = newValue;
      selectedObj.angle = 0; // Initialize angle if not set
    }

    // Calculate difference from previous
    const diff = newValue - selectedObj.prevRotation;

    // Apply difference to current angle (rotation around center)
    selectedObj.angle += diff * 0.5;

    // Update previous value
    selectedObj.prevRotation = newValue;

    // Send rotation update with center-based rotation flag
    updateText({ 
      angle: selectedObj.angle,
      rotateFromCenter: true // Flag to indicate center-based rotation
    });
  });
});

//  line  height slider
line_height_slider.addEventListener("input", (e) => {
  TextMessageWrapper(() => {
    Texts[selectedText].lineHeight = e.target.value;
    updateText({ lineHeight: Texts[selectedText].lineHeight });
  });
});

// update text Color
Coloris({
  themeMode: "dark",
  alpha: false,
  onChange: (color, inputEl) => {
    Texts[selectedText].fill = color;
    updateText({ fill: color });
  },
});

var colorPicker = new iro.ColorPicker("#picker", {
  width: 120,
  color: "#ffffff",
  layout: [
    {
      component: iro.ui.Box,
    },
    {
      component: iro.ui.Slider,
      options: {
        id: "hue-slider",
        sliderType: "hue",
      },
    },
  ],
});

//  add fonts

const selectEleFont = document.querySelector(".font-inp");
const lists = document.querySelector(".custom-dialog>ul");
const item = document.querySelector(".custom-dialog");

selectEleFont.addEventListener("click", (e) => {
  if (item.classList.contains("open")) {
    item.classList.remove("open");
    selectEleFont.classList.remove("rem-bottom-border");
  } else {
    item.classList.add("open");
    selectEleFont.classList.add("rem-bottom-border");
  }
});

const systemFonts = [
  "Arial",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Garamond",
  "Palatino Linotype",
  "Bookman",
  "Courier New",
  "Lucida Console",
  "Brush Script MT",
  "Comic Sans MS",
];

const fonts = [
  "Roboto",
  "Hammersmith One",
  "Ultra",
  "Pacifico",
  "Lobster",
  "Oswald",
  "Montserrat",
  "Poppins",
  "Raleway",
  "Anton",
  "Bebas Neue",
  "Playfair Display",
  "Ubuntu",
  "Merriweather",
  "Open Sans",
  "Catamaran",
  "Shadows Into Light",
  "Dancing Script",
  "Josefin Sans",
  "Nunito",
  "Fira Sans",
  "Work Sans",
  "Kanit",
  "Exo 2",
  "Source Sans Pro",
  "Quicksand",
  "Great Vibes",
  "Amatic SC",
  "Indie Flower",
  "Cinzel",
  "Abril Fatface",
  "Righteous",
  "Teko",
  "Zilla Slab",
  "Fredoka One",
  "Signika",
  "Archivo Black",
];

WebFont.load({
  google: {
    families: fonts,
  },
  active: function () {
    [...systemFonts, ...fonts].forEach((it) => {
      const li = document.createElement("li");
      li.innerText = it;
      li.setAttribute("data-font", it);
      li.style.fontFamily = it;
      lists.appendChild(li);
      li.onclick = () => {
        TextMessageWrapper(() => {
          const selectedFont = document.querySelector(".selected-font");
          selectedFont.innerText = it;
          selectedFont.style.fontFamily = it;
          selectEleFont.style.fontFamily = it;
          Texts[selectedText].fontFamily = it;
          updateText({ fontFamily: it });
        });
      };
    });
  },
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!selectEleFont.contains(e.target)) {
    item.classList.remove("open");
    selectEleFont.classList.remove("rem-bottom-border");
  }
});

// update Model Color
colorPicker.on("color:change", function (color) {
  document.querySelector("#model-color-inp").value = color.hexString;
  postToIframe({
    type: "change-color",
    payload: {
      clr: color.hexString,
    },
  });
});

document.querySelector("#model-color-inp").addEventListener("input", (e) => {
  colorPicker.color.set(e.target.value);
});

document.querySelector("#color-dor-parent").addEventListener("click", (e) => {
  colorPicker.color.set(e.target.getAttribute("data-color"));
});

// Image upload

// Image upload functionality
document.getElementById("upload-area").addEventListener("click", () => {
  document.getElementById("image-upload").click();
});

document.getElementById("image-upload").addEventListener("input", (e) => {
  const file = e.target.files[0];
  if (file) {
    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      notifications.show(
        "Please upload a valid image file (JPG, PNG, WebP)",
        "error"
      );
      return;
    }

    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      notifications.show(
        "Image file too large. Please use images under 5MB",
        "error"
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target.result;
      const id = crypto.randomUUID();

      // Add default properties including scale for the sliders
      const newImageObject = {
        _id: id,
        width: 500,
        height: 500,
        top: 20,
        left: 20,
        scale: 400, // Default scale value
        angle: 0,   // Default rotation
        url: imageUrl,
      };

      Images.push(newImageObject);
      CreateImageLayer(imageUrl, id);

      // Auto-select the newly uploaded image
      selectedImage = Images.length - 1;

      // Update UI to show this layer as selected
      document.querySelector(".selected_layer")?.classList.remove("selected_layer");
      document.querySelector(`[data-id='${id}']`).classList.add("selected_layer");

      // Update slider values to match the new image properties
      X_slider_image.value = newImageObject.left;
      Y_slider_image.value = newImageObject.top;
      size_slider_image.value = newImageObject.scale;
      rot_slider_image.value = newImageObject.angle * 2; // Rotation slider uses 2x multiplier

      // Switch to Image customization tab if not already active
      if (SelectedCustomization !== "Image") {
        document.querySelector("#text-customization").style.display = "none";
        document.querySelector("#image-customization").style.display = "block";

        document.querySelector(".customization-buttons>button.active").classList.remove("active");
        document.querySelector(".customization-buttons button:first-child").classList.add("active");
        SelectedCustomization = "Image";
      }

      // Load image for interactive canvas
      const img = new Image();
      img.onload = () => {
        canvasImage = img;

        // Synchronize canvas dimensions with 2D preview
        const mugPreview = document.getElementById("mug-2d-preview");
        if (mugPreview && interactiveCanvas) {
          const mugRect = mugPreview.getBoundingClientRect();
          if (mugRect.width > 0 && mugRect.height > 0) {
            interactiveCanvas.width = mugRect.width;
            interactiveCanvas.height = mugRect.height;
          }
        }

        // Calculate proper scale to fit image without cropping
        const scaleX = interactiveCanvas.width / img.width;
        const scaleY = interactiveCanvas.height / img.height;
        // Use the smaller scale to ensure the entire image fits
        const scaleToFit = Math.min(scaleX, scaleY) * 0.8; // 0.8 for some padding

        // Center the image perfectly in the canvas
        const scaledWidth = img.width * scaleToFit;
        const scaledHeight = img.height * scaleToFit;
        canvasImageX = (interactiveCanvas.width - scaledWidth) / 2;
        canvasImageY = (interactiveCanvas.height - scaledHeight) / 2;
        canvasImageScale = scaleToFit;

        drawInteractiveCanvas();
      };
      img.src = imageUrl;

      // Send to iframe
      postToIframe({
        type: "add-image",
        payload: { url: imageUrl, _id: id },
      });

      // Auto-select the layer in the 3D canvas as well
      setTimeout(() => {
        postToIframe({ type: "select-layer", payload: { _id: id } });
      }, 100);

      e.target.value = "";
    };

    reader.onerror = () => {
      notifications.show("Error reading image file", "error");
    };

    reader.readAsDataURL(file);
  }
});

size_slider_image.addEventListener("input", (e) => {
  ImageMessageWrapper(() => {
    Images[selectedImage].scale = e.target.value;
    updateImage({ scale: e.target.value });
    updateInteractiveCanvas();
  });
});

//  update Image postion
X_slider_image.addEventListener("input", (e) => {
  ImageMessageWrapper(() => {
    Images[selectedImage].left = e.target.value;
    updateImage({ left: Images[selectedImage].left });
    updateInteractiveCanvas();
  });
});

Y_slider_image.addEventListener("input", (e) => {
  ImageMessageWrapper(() => {
    Images[selectedImage].top = e.target.value;
    updateImage({ top: Images[selectedImage].top });
    updateInteractiveCanvas();
  });
});

rot_slider_image.addEventListener("input", (e) => {
  ImageMessageWrapper(() => {
    const newValue = parseInt(e.target.value);
    const selectedObj = Images[selectedImage];

    // Initialize if not set
    if (selectedObj.prevRotation === undefined) {
      selectedObj.prevRotation = newValue;
      selectedObj.angle = 0; // Initialize angle if not set
    }

    // Calculate difference from previous
    const diff = newValue - selectedObj.prevRotation;

    // Apply difference to current angle (rotation around center)
    selectedObj.angle += diff * 0.5;

    // Update previous value
    selectedObj.prevRotation = newValue;

    // Send rotation update - the 3D iframe should handle center-based rotation
    updateImage({ 
      angle: selectedObj.angle,
      rotateFromCenter: true // Flag to indicate center-based rotation
    });
  });
});

// remove bg image
document.querySelector(".remove-bg-btn").addEventListener("click", (e) => {
  ImageMessageWrapper(async () => {
    if (Images[selectedImage].backgroundRemoved) {
      if (!notifications.showing) {
        notifications.show("Background Already Removed", "success");
      }
      return;
    }

    try {
      document.querySelector("#loading-indicator-image").style.display = "block";

      // Check if ONNX model is loaded
      if (!isModelLoaded) {
        notifications.show("AI model is loading, please wait...", "warning");
        await loadONNXModel();
      }

      const currentImage = Images[selectedImage];
      const oldId = currentImage._id;

      // Remove background using ONNX model
      const processedImageUrl = await removeBackgroundWithONNX(currentImage.url);

      // ✅ FIRST: Delete the existing layer from fabric canvas and 3D model
      postToIframe({
        type: "delete-layer",
        payload: { _id: oldId }
      });

      // ✅ SECOND: Remove from local arrays and DOM
      const imageIndex = Images.findIndex((img) => img._id === oldId);
      if (imageIndex >= 0) {
        Images.splice(imageIndex, 1);
      }
      const imageLayerElement = document.querySelector(`[data-id='${oldId}']`);
      if (imageLayerElement) {
        imageLayerElement.remove();
      }

      // ✅ THIRD: Create new layer with background-removed image
      const newId = crypto.randomUUID();
      const newImageObject = {
        _id: newId,
        width: currentImage.width || 500,
        height: currentImage.height || 500,
        top: currentImage.top || 20,
        left: currentImage.left || 20,
        scale: currentImage.scale || 500,
        angle: currentImage.angle || 0,
        url: processedImageUrl,
        backgroundRemoved: true
      };

      // Add to local state
      Images.push(newImageObject);

      // Create new DOM layer
      CreateImageLayer(processedImageUrl, newId);

      // Add to fabric canvas
      postToIframe({
        type: "add-image",
        payload: { url: processedImageUrl, _id: newId }
      });

      // Remove the preview image element completely if it exists
      const imagePreview = document.getElementById("image-preview");
      if (imagePreview) {
        imagePreview.remove();
      }

      // ✅ Apply texture to 3D model
      postToIframe({
        type: "apply-texture",
        payload: { url: processedImageUrl }
      });

      // ✅ Also send to main window for any local 3D handling
      window.postMessage({
        type: "update-image-texture",
        payload: { url: processedImageUrl }
      }, "*");

      // Reset selection
      selectedImage = Images.length - 1; // Select the new layer

      notifications.show("Background removed successfully", "success");
    } catch (err) {
      console.error("Error removing background:", err);
      notifications.show("Failed to remove background", "error");
    } finally {
      // Always hide loader
      document.querySelector("#loading-indicator-image").style.display = "none";
    }
  });
});



// Export design
document.querySelector("#export-view-btn").addEventListener("click", (e) => {
  postToIframe({ type: "export-data", payload: {} });
  notifications.show("Design exported!", "success");
});

// rest view
document.querySelector("#reset-view-btn").addEventListener("click", (e) => {
  Texts.length = 0;
  Images.length = 0;
  document.querySelectorAll(".text_layer").forEach((it) => it.remove());
  document.querySelectorAll(".image_layer").forEach((it) => it.remove());
  notifications.show("View has been reset!", "success");
  postToIframe({ type: "reset-view", payload: {} });
});

//  Auto Rotate
document.getElementById("auto-rotate-btn").addEventListener("click", () => {
  AnimatedCanvas = !AnimatedCanvas;
  const btn = document.getElementById("auto-rotate-btn");
  if (AnimatedCanvas) {
    btn.classList.add("active");
    btn.textContent = "Stop Rotate";
    postToIframe({ type: "rotate-control", payload: { enable: true } });
  } else {
    btn.classList.remove("active");
    btn.textContent = "Auto Rotate";
    postToIframe({ type: "rotate-control", payload: { enable: false } });
  }
});
function requestCanvasSnapshot() {
  if (Canvas && Canvas.contentWindow) {
    Canvas.contentWindow.postMessage(
      { type: "request-canvas-snapshot" },
      "https://3d-config-seven.vercel.app"
    );
  }
}

// Optimized postToIframe that avoids snapshot spam during drag operations
function postToIframe(data, skipSnapshot = false) {
  if (Canvas && Canvas.contentWindow) {
    Canvas.contentWindow.postMessage(
      data,
      "https://3d-config-seven.vercel.app"
    );

    // Only request snapshot if not explicitly skipped and not during active drag
    if (!skipSnapshot && !isDragging) {
      // Small delay lets the iframe apply changes before snapshotting
      setTimeout(requestCanvasSnapshot, 120);
    }
  }
}
//  update Text
const updateText = (payload) => {
  postToIframe({ type: "update-text", payload: payload });
};

//  update image with drag optimization
const updateImage = (payload) => {
  // Skip automatic snapshots during drag to reduce load
  postToIframe({ type: "update-image", payload: payload }, isDragging);
};

//  select layer
const updateSelectedLayer = (payload) => {
  document.querySelector(".selected_layer")?.classList.remove("selected_layer");
  document
    .querySelector(`[data-id='${payload._id}']`)
    .classList.add("selected_layer");
};

// Interactive 2D Canvas functionality with optimized performance
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartLeft = 0;
let dragStartTop = 0;
let pendingUpdate = null;
let lastSnapshotRequest = 0;
const SNAPSHOT_THROTTLE_MS = 100; // Limit snapshots to 10fps during drag

// Interactive Canvas variables
let interactiveCanvas = null;
let interactiveCtx = null;
let canvasImage = null;
let canvasImageScale = 1;
let canvasImageX = 0;
let canvasImageY = 0;
let isCanvasDragging = false;
let canvasDragStartX = 0;
let canvasDragStartY = 0;
let canvasDragStartImageX = 0;
let canvasDragStartImageY = 0;

// Throttled update function to batch position changes
const throttledImageUpdate = (() => {
  let timeoutId = null;
  return (left, top) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      if (selectedImage !== false && Images[selectedImage]) {
        Images[selectedImage].left = left;
        Images[selectedImage].top = top;
        updateImage({ left, top });

        // Request snapshot only if enough time has passed
        const now = Date.now();
        if (now - lastSnapshotRequest > SNAPSHOT_THROTTLE_MS) {
          lastSnapshotRequest = now;
          setTimeout(requestCanvasSnapshot, 50); // Small delay to let 3D render
        }
      }
    }, 16); // ~60fps for smooth visual feedback
  };
})();

// Add drag functionality to 2D mug preview
function setupMugPreviewInteraction() {

  const mugPreview = document.getElementById("mug-2d-preview");
  if (mugPreview) {
    // Mouse down event
    mugPreview.addEventListener("mousedown", (e) => {
      // If no image is selected but we have images, select the first one
      if (selectedImage === false && Images.length > 0) {
        selectedImage = 0;
        const firstImageId = Images[0]._id;

        // Update UI to show this layer as selected
        document.querySelector(".selected_layer")?.classList.remove("selected_layer");
        document.querySelector(`[data-id='${firstImageId}']`)?.classList.add("selected_layer");

        // Update slider values to match the selected image properties
        X_slider_image.value = Images[0].left || 0;
        Y_slider_image.value = Images[0].top || 0;
        size_slider_image.value = Images[0].scale || 400;
        rot_slider_image.value = (Images[0].angle || 0) * 2;

        // Switch to Image customization tab if not already active
        if (SelectedCustomization !== "Image") {
          document.querySelector("#text-customization").style.display = "none";
          document.querySelector("#image-customization").style.display = "block";
          document.querySelector(".customization-buttons>button.active").classList.remove("active");
          document.querySelector(".customization-buttons button:first-child").classList.add("active");
          SelectedCustomization = "Image";
        }

        // Tell the 3D iframe to select this layer
        postToIframe({ type: "select-layer", payload: { _id: firstImageId } });

        console.log("Auto-selected first image layer on 2D preview click");
      }

      if (selectedImage === false) {
        return; // No image selected and no images available
      }

      e.preventDefault();
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartLeft = parseFloat(X_slider_image.value);
      dragStartTop = parseFloat(Y_slider_image.value);

      mugPreview.style.cursor = "grabbing";
    });

    // Mouse move event with optimized throttling
    document.addEventListener("mousemove", (e) => {
      if (!isDragging || selectedImage === false) return;

      e.preventDefault();

      // Calculate movement delta
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;

      // Convert pixel movement to slider values with model-specific handling
      const sensitivity = 2;

      // Different axis handling for different models
      let invertX = 1;
      let invertY = 1;

      if (SELECTED_MODEL === "Shirt") {
        invertY = -1;
        invertX = -1; 
      } else if (SELECTED_MODEL === "Poster") {
        invertX = -1; // Invert X-axis for Poster to fix left/right direction
        invertY = -1; // Invert Y-axis for Poster canvas preview
      }

      const newLeft = Math.max(parseFloat(X_slider_image.min), 
                              Math.min(parseFloat(X_slider_image.max), 
                                      dragStartLeft + (deltaX * sensitivity * invertX)));

      const newTop = Math.max(parseFloat(Y_slider_image.min), 
                             Math.min(parseFloat(Y_slider_image.max), 
                                     dragStartTop + (deltaY * sensitivity * invertY)));


      // Update sliders immediately for visual feedback
      X_slider_image.value = newLeft;
      Y_slider_image.value = newTop;

      // Use throttled update for 3D scene and snapshots
      throttledImageUpdate(newLeft, newTop);
    });

    // Mouse up event - final update
    document.addEventListener("mouseup", (e) => {
      if (isDragging) {
        isDragging = false;
        mugPreview.style.cursor = "grab";

        // Ensure final position is applied
        const finalLeft = parseFloat(X_slider_image.value);
        const finalTop = parseFloat(Y_slider_image.value);

        if (selectedImage !== false && Images[selectedImage]) {
          Images[selectedImage].left = finalLeft;
          Images[selectedImage].top = finalTop;
          updateImage({ left: finalLeft, top: finalTop });

          // Request final snapshot after a brief delay
          setTimeout(requestCanvasSnapshot, 100);
        }
      }
    });

    // Mouse wheel zoom event
    mugPreview.addEventListener("wheel", (e) => {
      if (selectedImage === false) {
        return; // No image selected
      }

      e.preventDefault();

      // Get current scale and position values
      const currentScale = parseFloat(size_slider_image.value);
      const currentLeft = parseFloat(X_slider_image.value);
      const currentTop = parseFloat(Y_slider_image.value);
      const minScale = parseFloat(size_slider_image.min);
      const maxScale = parseFloat(size_slider_image.max);

      // deltaY > 0 means scrolling down (zoom out), deltaY < 0 means scrolling up (zoom in)
      const zoomSensitivity = 40; // larger = slower zoom
      const zoomDelta = (e.deltaY < 0 ? 1 : -1) * (maxScale - minScale) / zoomSensitivity;

      // Calculate new scale value
      const newScale = Math.max(minScale, Math.min(maxScale, currentScale + zoomDelta));

      // Update slider + sync with 3D model
      if (newScale !== currentScale) {
        // Calculate scale ratio for center-based scaling
        const scaleRatio = newScale / currentScale;

        // Get mouse position relative to the preview element
        const rect = mugPreview.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert mouse position to image coordinates (normalized to image size)
        const imageWidth = Images[selectedImage].width || 500;
        const imageHeight = Images[selectedImage].height || 500;
        const normalizedMouseX = (mouseX / rect.width) * imageWidth;
        const normalizedMouseY = (mouseY / rect.height) * imageHeight;

        // Calculate new position to keep the point under the mouse stationary
        const newLeft = normalizedMouseX - (normalizedMouseX - currentLeft) * scaleRatio;
        const newTop = normalizedMouseY - (normalizedMouseY - currentTop) * scaleRatio;

        // Constrain to slider bounds
        const constrainedLeft = Math.max(parseFloat(X_slider_image.min), 
                                        Math.min(parseFloat(X_slider_image.max), newLeft));
        const constrainedTop = Math.max(parseFloat(Y_slider_image.min), 
                                       Math.min(parseFloat(Y_slider_image.max), newTop));

        // Update sliders
        size_slider_image.value = newScale;
        X_slider_image.value = constrainedLeft;
        Y_slider_image.value = constrainedTop;

        // Update image properties
        Images[selectedImage].scale = newScale;
        Images[selectedImage].left = constrainedLeft;
        Images[selectedImage].top = constrainedTop;

        // Update the 3D iframe
        updateImage({ 
          scale: newScale,
          left: constrainedLeft,
          top: constrainedTop
        });

        // Refresh snapshot preview
        setTimeout(requestCanvasSnapshot, 50);
      }
    });


    // Set initial cursor style
    mugPreview.style.cursor = "grab";
    mugPreview.style.userSelect = "none"; // Prevent text selection while dragging
  }
}

// Initialize interactive canvas
function initializeInteractiveCanvas() {
  interactiveCanvas = document.getElementById("interactive-canvas");
  if (!interactiveCanvas) return;

  interactiveCtx = interactiveCanvas.getContext("2d");

  // Match the 2D preview dimensions
  const mugPreview = document.getElementById("mug-2d-preview");
  if (mugPreview) {
    // Get the computed style of the mug preview to match dimensions
    const mugRect = mugPreview.getBoundingClientRect();
    if (mugRect.width > 0 && mugRect.height > 0) {
      interactiveCanvas.width = mugRect.width;
      interactiveCanvas.height = mugRect.height;
    }
  }

  // Mouse events for interactive canvas
  interactiveCanvas.addEventListener("mousedown", handleCanvasMouseDown);
  interactiveCanvas.addEventListener("wheel", handleCanvasWheel);
  document.addEventListener("mousemove", handleCanvasMouseMove);
  document.addEventListener("mouseup", handleCanvasMouseUp);

  // Initial draw
  drawInteractiveCanvas();
}

function handleCanvasMouseDown(e) {
  if (!canvasImage || selectedImage === false) return;

  e.preventDefault();
  isCanvasDragging = true;

  const rect = interactiveCanvas.getBoundingClientRect();
  canvasDragStartX = e.clientX - rect.left;
  canvasDragStartY = e.clientY - rect.top;
  canvasDragStartImageX = canvasImageX;
  canvasDragStartImageY = canvasImageY;

  interactiveCanvas.style.cursor = "grabbing";
}

function handleCanvasMouseMove(e) {
  if (!isCanvasDragging || !canvasImage || selectedImage === false) return;

  e.preventDefault();

  const rect = interactiveCanvas.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const currentY = e.clientY - rect.top;

  const deltaX = currentX - canvasDragStartX;
  const deltaY = currentY - canvasDragStartY;

  canvasImageX = canvasDragStartImageX + deltaX;
  canvasImageY = canvasDragStartImageY + deltaY;

  // Convert canvas position to slider values
  const canvasToSliderX = (canvasImageX / interactiveCanvas.width) * (parseFloat(X_slider_image.max) - parseFloat(X_slider_image.min)) + parseFloat(X_slider_image.min);
  const canvasToSliderY = (canvasImageY / interactiveCanvas.height) * (parseFloat(Y_slider_image.max) - parseFloat(Y_slider_image.min)) + parseFloat(Y_slider_image.min);

  // Update sliders
  X_slider_image.value = Math.max(parseFloat(X_slider_image.min), Math.min(parseFloat(X_slider_image.max), canvasToSliderX));
  Y_slider_image.value = Math.max(parseFloat(Y_slider_image.min), Math.min(parseFloat(Y_slider_image.max), canvasToSliderY));

  // Update image properties and 3D model
  if (Images[selectedImage]) {
    Images[selectedImage].left = parseFloat(X_slider_image.value);
    Images[selectedImage].top = parseFloat(Y_slider_image.value);
    updateImage({ left: Images[selectedImage].left, top: Images[selectedImage].top });
  }

  drawInteractiveCanvas();
}

function handleCanvasMouseUp(e) {
  if (isCanvasDragging) {
    isCanvasDragging = false;
    interactiveCanvas.style.cursor = "grab";

    // Final update
    setTimeout(requestCanvasSnapshot, 100);
  }
}

function handleCanvasWheel(e) {
  if (!canvasImage || selectedImage === false) return;

  e.preventDefault();

  const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = Math.max(0.1, Math.min(5, canvasImageScale * scaleFactor));

  if (newScale !== canvasImageScale) {
    canvasImageScale = newScale;

    // Convert scale to slider value
    const scaleRange = parseFloat(size_slider_image.max) - parseFloat(size_slider_image.min);
    const normalizedScale = (canvasImageScale - 0.1) / (5 - 0.1); // Normalize 0.1-5 to 0-1
    const sliderValue = parseFloat(size_slider_image.min) + (normalizedScale * scaleRange);

    size_slider_image.value = Math.max(parseFloat(size_slider_image.min), Math.min(parseFloat(size_slider_image.max), sliderValue));

    if (Images[selectedImage]) {
      Images[selectedImage].scale = parseFloat(size_slider_image.value);
      updateImage({ scale: Images[selectedImage].scale });
    }

    drawInteractiveCanvas();
    setTimeout(requestCanvasSnapshot, 50);
  }
}

function drawInteractiveCanvas() {
  if (!interactiveCtx) return;

  // Clear canvas
  interactiveCtx.clearRect(0, 0, interactiveCanvas.width, interactiveCanvas.height);

  // Draw background
  interactiveCtx.fillStyle = "#f8f9fa";
  interactiveCtx.fillRect(0, 0, interactiveCanvas.width, interactiveCanvas.height);

  // Hide/show instructions
  const instructions = document.getElementById("canvas-instructions");
  if (canvasImage && instructions) {
    instructions.style.display = "none";
  } else if (instructions) {
    instructions.style.display = "block";
  }

  // Draw image if available
  if (canvasImage) {
    // Use the base scale calculated during image load, then apply current scale factor
    const imgWidth = canvasImage.width * canvasImageScale;
    const imgHeight = canvasImage.height * canvasImageScale;

    interactiveCtx.save();
    interactiveCtx.drawImage(canvasImage, canvasImageX, canvasImageY, imgWidth, imgHeight);
    interactiveCtx.restore();

    // Draw selection outline
    if (selectedImage !== false) {
      interactiveCtx.strokeStyle = "#d32f2f";
      interactiveCtx.lineWidth = 2;
      interactiveCtx.setLineDash([5, 5]);
      interactiveCtx.strokeRect(canvasImageX, canvasImageY, imgWidth, imgHeight);
      interactiveCtx.setLineDash([]);
    }
  }
}

function updateInteractiveCanvas() {
  if (!canvasImage || selectedImage === false) return;

  // Update canvas position based on sliders (proportional to canvas size)
  // Calculate position relative to center to maintain proper centering
  const sliderRangeX = parseFloat(X_slider_image.max) - parseFloat(X_slider_image.min);
  const sliderRangeY = parseFloat(Y_slider_image.max) - parseFloat(Y_slider_image.min);

  const normalizedX = (parseFloat(X_slider_image.value) - parseFloat(X_slider_image.min)) / sliderRangeX;
  const normalizedY = (parseFloat(Y_slider_image.value) - parseFloat(Y_slider_image.min)) / sliderRangeY;

  // Map to canvas coordinates while maintaining centering
  const scaledWidth = canvasImage.width * canvasImageScale;
  const scaledHeight = canvasImage.height * canvasImageScale;

  canvasImageX = normalizedX * (interactiveCanvas.width - scaledWidth);
  canvasImageY = normalizedY * (interactiveCanvas.height - scaledHeight);

  // Update scale proportionally to match 3D model scaling
  const scaleRange = parseFloat(size_slider_image.max) - parseFloat(size_slider_image.min);
  const normalizedSliderScale = (parseFloat(size_slider_image.value) - parseFloat(size_slider_image.min)) / scaleRange;

  // Base scale ensures image fits completely without cropping
  const baseScaleX = interactiveCanvas.width / canvasImage.width;
  const baseScaleY = interactiveCanvas.height / canvasImage.height;
  const baseScale = Math.min(baseScaleX, baseScaleY) * 0.8; // 0.8 for padding

  // Apply slider scaling with proper range
  const minScale = baseScale * 0.1;
  const maxScale = baseScale * 3.0;
  canvasImageScale = minScale + (normalizedSliderScale * (maxScale - minScale));

  drawInteractiveCanvas();
}

// Call setup function when DOM is ready and also when canvas loads
document.addEventListener("DOMContentLoaded", () => {
  setupMugPreviewInteraction();
  initializeInteractiveCanvas();
});

// Also setup when the canvas loads (in case the preview image loads later)
Canvas.addEventListener("load", () => {
  setupMugPreviewInteraction();
});

// receive messages
window.addEventListener("message", (event) => {
  const { type, payload } = event.data;
  if (!payload) {
    return;
  }

  switch (type) {
    case "update-text":
      selectedText = Texts.findIndex((ele) => ele._id === payload._id);
      updateSelectedLayer(payload);
      X_slider.value = payload.left;
      Y_slider.value = payload.top;
      size_slider.value = payload.fontSize;
      rot_slider.value = payload.angle * 2;
      selectEleFont.value = payload.fontFamily;
      line_height_slider.value = payload.lineHeight;
      Texts[selectedText] = { ...payload };
      break;
    case "select-clear":
      selectedText = false;
      selectedImage = false;
      document
        .querySelector(".selected_layer")
        ?.classList.remove("selected_layer");
      break;
    case "update-image":
      selectedImage = Images.findIndex((ele) => ele._id === payload._id);
      updateSelectedLayer(payload);
      X_slider_image.value = payload.left;
      Y_slider_image.value = payload.top;
      size_slider_image.value = payload.scale;
      rot_slider_image.value = payload.angle * 2;
      Images[selectedImage] = { ...Images[selectedImage], ...payload };
      updateInteractiveCanvas();
      break;
    case "canvas-snapshot":
      // payload.url is a data URL (base64 PNG) of the Fabric canvas
      const preview = document.getElementById("mug-2d-preview");
      if (preview) preview.src = payload.url;
      break;
    case "export-image":
      const link = document.createElement("a");
      link.href = payload.url;
      link.download = "Exported Design.png";
      link.click();
      break;
    case "loading-false-image":
      document.querySelector("#loading-indicator-image").style.display = "none";
      selectedImage = Images.findIndex((ele) => ele._id === payload._id);
      Images[selectedImage].url = payload.url;
      Images[selectedImage].backgroundRemoved = true;
      // Send the background-removed image to the 3D model
      updateImage({ url: payload.url });
      break;
    case "update-image-texture":
      // Handle texture update from local background removal
      selectedImage = Images.findIndex((ele) => ele._id === payload._id);
      if (selectedImage >= 0) {
        Images[selectedImage].url = payload.url;
        // Update the 3D model with the new texture
        updateImage({ url: payload.url });
      }
      break;
    case "replace-image-texture":
      // Handle complete texture replacement (used for background removal)
      selectedImage = Images.findIndex((ele) => ele._id === payload._id);
      if (selectedImage >= 0) {
        Images[selectedImage].url = payload.url;
        Images[selectedImage].backgroundRemoved = true;
        // Update the 3D model with the background-removed image
        updateImage({ url: payload.url });
      }
      break;
  }
});
