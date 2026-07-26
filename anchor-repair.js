(function (root) {
  'use strict';

  const SAMPLE_MAX_WIDTH = 960;
  const ANCHOR_TEMPLATE_SIZE = 60;
  const OUTER_COMPONENT_SIZE = 52;

  let sampleCanvas;
  let outputCanvas;

  function longestRun(values, minimum) {
    let best = null;
    let start = -1;

    for (let index = 0; index <= values.length; index += 1) {
      if (index < values.length && values[index] >= minimum) {
        if (start < 0) {
          start = index;
        }
        continue;
      }

      if (start >= 0) {
        const run = { start, end: index - 1 };
        if (!best || run.end - run.start > best.end - best.start) {
          best = run;
        }
        start = -1;
      }
    }

    return best;
  }

  function collectComponents(mask, width, height) {
    const seen = new Uint8Array(mask.length);
    const components = [];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const first = y * width + x;
        if (!mask[first] || seen[first]) {
          continue;
        }

        const stack = [first];
        seen[first] = 1;
        let count = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        while (stack.length > 0) {
          const current = stack.pop();
          const currentX = current % width;
          const currentY = Math.floor(current / width);
          count += 1;
          minX = Math.min(minX, currentX);
          maxX = Math.max(maxX, currentX);
          minY = Math.min(minY, currentY);
          maxY = Math.max(maxY, currentY);

          const neighbors = [
            currentX > 0 ? current - 1 : -1,
            currentX + 1 < width ? current + 1 : -1,
            currentY > 0 ? current - width : -1,
            currentY + 1 < height ? current + width : -1,
          ];

          for (const neighbor of neighbors) {
            if (neighbor >= 0 && mask[neighbor] && !seen[neighbor]) {
              seen[neighbor] = 1;
              stack.push(neighbor);
            }
          }
        }

        components.push({
          count,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          x: (minX + maxX + 1) / 2,
          y: (minY + maxY + 1) / 2,
        });
      }
    }

    return components;
  }

  function findAnchorCenters(pixels, width, height, sourceWidth, sourceHeight) {
    if (!pixels || width <= 0 || height <= 0 || pixels.length < width * height * 4) {
      return [];
    }

    const saturatedColumns = new Uint16Array(width);
    const saturatedRows = new Uint16Array(height);
    const neutralMask = new Uint8Array(width * height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const chroma = maximum - minimum;

        if (maximum > 70 && chroma > 75) {
          saturatedColumns[x] += 1;
          saturatedRows[y] += 1;
        }
        if (maximum > 145 && chroma < 35) {
          neutralMask[pixel] = 1;
        }
      }
    }

    const columnRun = longestRun(saturatedColumns, Math.max(4, Math.round(height * 0.2)));
    const rowRun = longestRun(saturatedRows, Math.max(4, Math.round(width * 0.15)));
    if (!columnRun || !rowRun) {
      return [];
    }

    const codeWidth = columnRun.end - columnRun.start + 1;
    const codeHeight = rowRun.end - rowRun.start + 1;
    const targets = [
      { x: columnRun.start, y: rowRun.start },
      { x: columnRun.end, y: rowRun.start },
      { x: columnRun.start, y: rowRun.end },
      { x: columnRun.end, y: rowRun.end },
    ];
    const tolerance = Math.max(10, codeWidth * 0.16, codeHeight * 0.16);
    const minimumSide = Math.max(4, Math.round(Math.min(width, height) * 0.008));
    const maximumSide = Math.max(minimumSide + 1, Math.round(Math.min(width, height) * 0.18));

    const candidates = collectComponents(neutralMask, width, height).filter((component) => {
      const ratio = component.width / component.height;
      return (
        component.count >= minimumSide * minimumSide * 0.3 &&
        component.width >= minimumSide &&
        component.height >= minimumSide &&
        component.width <= maximumSide &&
        component.height <= maximumSide &&
        ratio >= 0.6 &&
        ratio <= 1.6
      );
    });

    const selected = [];
    const used = new Set();
    for (const target of targets) {
      let best = null;
      let bestScore = -1;

      for (let index = 0; index < candidates.length; index += 1) {
        if (used.has(index)) {
          continue;
        }
        const candidate = candidates[index];
        const distance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
        if (distance > tolerance) {
          continue;
        }
        const score = candidate.count / (1 + distance * 0.35);
        if (score > bestScore) {
          best = { candidate, index };
          bestScore = score;
        }
      }

      if (!best) {
        return [];
      }
      used.add(best.index);
      selected.push(best.candidate);
    }

    const scaleX = sourceWidth / width;
    const scaleY = sourceHeight / height;
    return selected.map((component) => ({
      x: component.x * scaleX,
      y: component.y * scaleY,
      size: (
        (component.width * scaleX + component.height * scaleY) / 2
      ) * ANCHOR_TEMPLATE_SIZE / OUTER_COMPONENT_SIZE,
    }));
  }

  function fillRect(pixels, width, height, x, y, rectWidth, rectHeight, value) {
    const startX = Math.max(0, Math.round(x));
    const startY = Math.max(0, Math.round(y));
    const endX = Math.min(width, Math.round(x + rectWidth));
    const endY = Math.min(height, Math.round(y + rectHeight));

    for (let row = startY; row < endY; row += 1) {
      for (let column = startX; column < endX; column += 1) {
        const offset = (row * width + column) * 4;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
      }
    }
  }

  function paintAnchor(pixels, width, height, centerX, centerY, size, secondary) {
    const anchorSize = Math.max(12, Math.round(size));
    const left = Math.round(centerX - anchorSize / 2);
    const top = Math.round(centerY - anchorSize / 2);
    const scaled = (value) => Math.round(value * anchorSize / ANCHOR_TEMPLATE_SIZE);
    const innerOffset = secondary ? 23 : 16;
    const innerSize = secondary ? 14 : 28;

    fillRect(pixels, width, height, left, top, anchorSize, anchorSize, 0);
    fillRect(pixels, width, height, left + scaled(2), top + scaled(2), anchorSize - scaled(4), anchorSize - scaled(4), 255);
    fillRect(pixels, width, height, left + scaled(9), top + scaled(9), anchorSize - scaled(18), anchorSize - scaled(18), 0);
    fillRect(pixels, width, height, left + scaled(innerOffset), top + scaled(innerOffset), scaled(innerSize), scaled(innerSize), 255);
  }

  function copyFrame(video) {
    if (
      typeof document === 'undefined' ||
      !video ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return null;
    }

    const sampleWidth = Math.min(SAMPLE_MAX_WIDTH, video.videoWidth);
    const sampleHeight = Math.max(1, Math.round(video.videoHeight * sampleWidth / video.videoWidth));
    sampleCanvas = sampleCanvas || document.createElement('canvas');
    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;

    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) {
      return null;
    }

    sampleContext.drawImage(video, 0, 0, sampleWidth, sampleHeight);
    const samplePixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const anchors = findAnchorCenters(samplePixels, sampleWidth, sampleHeight, video.videoWidth, video.videoHeight);
    if (anchors.length !== 4) {
      return null;
    }

    outputCanvas = outputCanvas || document.createElement('canvas');
    outputCanvas.width = video.videoWidth;
    outputCanvas.height = video.videoHeight;
    const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true });
    if (!outputContext) {
      return null;
    }

    outputContext.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height);
    const image = outputContext.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    const averageSize = anchors.reduce((total, anchor) => total + anchor.size, 0) / anchors.length;
    const anchorSize = Math.max(24, Math.min(Math.min(outputCanvas.width, outputCanvas.height) * 0.15, averageSize));

    for (let index = 0; index < anchors.length; index += 1) {
      const anchor = anchors[index];
      paintAnchor(image.data, outputCanvas.width, outputCanvas.height, anchor.x, anchor.y, anchorSize, index === 3);
    }

    return {
      pixels: new Uint8Array(image.data.buffer),
      format: 'RGBA',
      width: outputCanvas.width,
      height: outputCanvas.height,
      repairedAnchors: anchors,
    };
  }

  root.CimbarAnchorRepair = {
    findAnchorCenters,
    paintAnchor,
    copyFrame,
  };
}(globalThis));
