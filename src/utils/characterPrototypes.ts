/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCanvas, context } from './canvasHelpers';
import type { SemanticPart } from './semanticSegmentation';

/**
 * Generates the Warrior character canvas (from the user's attachment)
 * Features: Brown parted hair, facial skin, calm brown eyes, thin smiling mouth,
 * wooden hilt + steel blade sword over shoulder with leather strap, cream linen tunic.
 */
export function generateWarriorSampleCanvas(): HTMLCanvasElement {
  const width = 640;
  const height = 640;
  const canvas = createCanvas(width, height);
  const ctx = context(canvas);

  // In Node.js or environments without DOM Canvas, populate realistic character pixel regions for test coverage
  if (typeof document === 'undefined') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    // Tunic (clothes)
    for (let y = 390; y < 640; y++) {
      for (let x = 100; x < 540; x++) {
        const i = (y * width + x) * 4;
        data[i] = 237; data[i + 1] = 220; data[i + 2] = 210; data[i + 3] = 255;
      }
    }
    // Sword / leather strap (accessories)
    for (let y = 275; y < 350; y++) {
      for (let x = 140; x < 630; x++) {
        const i = (y * width + x) * 4;
        data[i] = 176; data[i + 1] = 184; data[i + 2] = 194; data[i + 3] = 255;
      }
    }
    // Face & neck (skin)
    for (let y = 200; y < 370; y++) {
      for (let x = 240; x < 410; x++) {
        const i = (y * width + x) * 4;
        data[i] = 232; data[i + 1] = 188; data[i + 2] = 158; data[i + 3] = 255;
      }
    }
    // Hair
    for (let y = 90; y < 230; y++) {
      for (let x = 200; x < 440; x++) {
        const i = (y * width + x) * 4;
        data[i] = 155; data[i + 1] = 108; data[i + 2] = 78; data[i + 3] = 255;
      }
    }
    // Eyes
    for (let x = 265; x < 300; x++) {
      const i = (245 * width + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
    // Mouth
    for (let x = 310; x < 330; x++) {
      const i = (315 * width + x) * 4;
      data[i] = 168; data[i + 1] = 76; data[i + 2] = 66; data[i + 3] = 255;
    }
    // Dark lineart contours
    for (let y = 100; y < 600; y += 25) {
      for (let x = 120; x < 500; x++) {
        const i = (y * width + x) * 4;
        data[i] = 15; data[i + 1] = 15; data[i + 2] = 15; data[i + 3] = 255;
      }
    }
    return canvas;
  }

  // Background is transparent (PNG sticker/illustration)
  ctx.clearRect(0, 0, width, height);

  // 1. Tunic / Vestiti (Base)
  ctx.fillStyle = '#eddcd2'; // Cream tunic
  ctx.beginPath();
  ctx.moveTo(170, 420);
  ctx.lineTo(240, 390);
  ctx.lineTo(320, 410);
  ctx.lineTo(400, 390);
  ctx.lineTo(470, 420);
  ctx.lineTo(580, 560);
  ctx.lineTo(540, 640);
  ctx.lineTo(100, 640);
  ctx.lineTo(60, 560);
  ctx.closePath();
  ctx.fill();

  // Tunic shaded folds
  ctx.fillStyle = '#d8c2b5';
  ctx.beginPath();
  ctx.moveTo(250, 430);
  ctx.lineTo(310, 470);
  ctx.lineTo(390, 430);
  ctx.lineTo(380, 530);
  ctx.lineTo(320, 580);
  ctx.lineTo(260, 530);
  ctx.closePath();
  ctx.fill();

  // Tunic chest lace / collar opening (slit)
  ctx.fillStyle = '#3a2e2b';
  ctx.fillRect(315, 435, 10, 85);
  // horizontal ties
  ctx.fillRect(305, 455, 30, 6);
  ctx.fillRect(305, 480, 30, 6);
  ctx.fillRect(305, 505, 30, 6);

  // 2. Leather strap & Sword (Accessori)
  // Leather strap across chest
  ctx.fillStyle = '#5c3826';
  ctx.beginPath();
  ctx.moveTo(210, 410);
  ctx.lineTo(250, 410);
  ctx.lineTo(460, 640);
  ctx.lineTo(420, 640);
  ctx.closePath();
  ctx.fill();

  // Sword resting horizontally over shoulder
  // Steel Blade
  ctx.fillStyle = '#b0b8c2';
  ctx.fillRect(400, 290, 230, 46);
  ctx.fillStyle = '#d0d7de';
  ctx.fillRect(400, 290, 230, 15); // highlight

  // Sword Guard / Hilt
  ctx.fillStyle = '#4a2f1b';
  ctx.fillRect(350, 275, 50, 76);
  // Wooden grip
  ctx.fillStyle = '#7a4e2d';
  ctx.fillRect(150, 300, 200, 28);
  // Pommel
  ctx.fillStyle = '#4a2f1b';
  ctx.beginPath();
  ctx.arc(140, 314, 22, 0, Math.PI * 2);
  ctx.fill();

  // Warrior's Hand holding the sword hilt
  ctx.fillStyle = '#e5b89a'; // Skin
  ctx.beginPath();
  ctx.arc(220, 314, 38, 0, Math.PI * 2);
  ctx.fill();

  // 3. Neck & Face (Pelle)
  ctx.fillStyle = '#dca888'; // Neck shadow
  ctx.fillRect(285, 330, 70, 75);

  ctx.fillStyle = '#e8bc9e'; // Face skin
  ctx.beginPath();
  ctx.moveTo(240, 220);
  ctx.quadraticCurveTo(230, 320, 320, 360); // Chin
  ctx.quadraticCurveTo(410, 320, 400, 220);
  ctx.quadraticCurveTo(320, 140, 240, 220);
  ctx.closePath();
  ctx.fill();

  // Ears (part of Pelle)
  ctx.beginPath();
  ctx.arc(235, 260, 20, 0, Math.PI * 2);
  ctx.arc(405, 260, 20, 0, Math.PI * 2);
  ctx.fill();

  // 4. Occhi (Eyes)
  ctx.fillStyle = '#ffffff'; // Sclera
  ctx.beginPath();
  ctx.ellipse(280, 245, 18, 10, -0.1, 0, Math.PI * 2);
  ctx.ellipse(360, 245, 18, 10, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4a2d1d'; // Calm brown anime irises
  ctx.beginPath();
  ctx.arc(280, 245, 8, 0, Math.PI * 2);
  ctx.arc(360, 245, 8, 0, Math.PI * 2);
  ctx.fill();

  // Eyebrows
  ctx.strokeStyle = '#4a2d1d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(265, 225);
  ctx.lineTo(298, 230);
  ctx.moveTo(342, 230);
  ctx.lineTo(375, 225);
  ctx.stroke();

  // 5. Bocca (Mouth)
  ctx.fillStyle = '#a84c42';
  ctx.beginPath();
  ctx.arc(320, 315, 14, 0.1, Math.PI - 0.1);
  ctx.fill();

  // 6. Capelli (Hair - Brown)
  ctx.fillStyle = '#9b6c4e'; // Base brown hair
  ctx.beginPath();
  // Hair volume top
  ctx.moveTo(220, 220);
  ctx.quadraticCurveTo(200, 100, 320, 90);
  ctx.quadraticCurveTo(440, 100, 420, 220);
  // Bangs
  ctx.lineTo(390, 180);
  ctx.lineTo(370, 210);
  ctx.lineTo(340, 175);
  ctx.lineTo(320, 215);
  ctx.lineTo(290, 180);
  ctx.lineTo(270, 215);
  ctx.lineTo(240, 185);
  ctx.closePath();
  ctx.fill();

  // Long side strands / lock over chest (characteristic of this warrior)
  ctx.beginPath();
  ctx.moveTo(395, 240);
  ctx.quadraticCurveTo(440, 320, 425, 410);
  ctx.quadraticCurveTo(410, 420, 400, 380);
  ctx.quadraticCurveTo(390, 300, 385, 250);
  ctx.closePath();
  ctx.fill();

  // 7. Lineart / Contorni (Pen strokes)
  ctx.strokeStyle = '#231815';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Hair lines
  ctx.stroke();

  // Face contour
  ctx.beginPath();
  ctx.moveTo(240, 220);
  ctx.quadraticCurveTo(230, 320, 320, 360);
  ctx.quadraticCurveTo(410, 320, 400, 220);
  ctx.stroke();

  // Eyelids
  ctx.beginPath();
  ctx.moveTo(265, 242);
  ctx.lineTo(295, 244);
  ctx.moveTo(345, 244);
  ctx.lineTo(375, 242);
  ctx.stroke();

  // Nose contour
  ctx.beginPath();
  ctx.moveTo(320, 260);
  ctx.lineTo(316, 280);
  ctx.lineTo(324, 282);
  ctx.stroke();

  // Mouth line
  ctx.beginPath();
  ctx.moveTo(310, 314);
  ctx.quadraticCurveTo(320, 322, 330, 314);
  ctx.stroke();

  // Sword and hand contours
  ctx.strokeRect(150, 300, 200, 28);
  ctx.strokeRect(350, 275, 50, 76);
  ctx.strokeRect(400, 290, 230, 46);

  // Tunic and shoulders
  ctx.beginPath();
  ctx.moveTo(170, 420);
  ctx.lineTo(240, 390);
  ctx.lineTo(320, 410);
  ctx.lineTo(400, 390);
  ctx.lineTo(470, 420);
  ctx.stroke();

  return canvas;
}

/**
 * Ground truth semantic parts for the Warrior character (normalized 0-1000).
 */
export function getWarriorSemanticGroundTruth(): SemanticPart[] {
  return [
    {
      id: 'warrior-lineart',
      label: 'Tratto',
      confidence: 0.99,
      description: 'Tratto a china e contorni neri di viso, capelli, spada e tunica',
      box_2d: [140, 93, 1000, 984],
      polygon: [
        [140, 343], [140, 500], [187, 656], [281, 656], [343, 625],
        [421, 625], [453, 984], [546, 984], [656, 843], [1000, 906],
        [1000, 156], [656, 93], [429, 234], [343, 218], [187, 343]
      ],
    },
    {
      id: 'warrior-accessories',
      label: 'Accessori',
      confidence: 0.96,
      description: 'Spada da combattimento con impugnatura, elsa e lama in acciaio, e tracolla in cuoio',
      box_2d: [429, 218, 1000, 984],
      polygon: [
        [429, 218], [429, 625], [453, 984], [546, 984], [546, 625],
        [1000, 718], [1000, 656], [656, 375], [515, 343], [515, 218]
      ],
    },
    {
      id: 'warrior-eyes',
      label: 'Occhi',
      confidence: 0.97,
      description: 'Occhi anime con iridi castane, riflessi e ciglia',
      box_2d: [351, 398, 414, 601],
      polygon: [
        [351, 398], [351, 484], [414, 484], [414, 398],
        [351, 531], [351, 601], [414, 601], [414, 531]
      ],
    },
    {
      id: 'warrior-mouth',
      label: 'Bocca',
      confidence: 0.95,
      description: 'Bocca del personaggio con labbra e accenno di sorriso',
      box_2d: [476, 476, 523, 531],
      polygon: [
        [476, 476], [476, 531], [523, 531], [523, 476]
      ],
    },
    {
      id: 'warrior-hair',
      label: 'Capelli',
      confidence: 0.98,
      description: 'Capelli castani con ciuffi frontali e ciocca lunga laterale sul petto',
      box_2d: [140, 312, 656, 687],
      polygon: [
        [140, 343], [140, 500], [187, 656], [281, 656], [375, 687],
        [468, 687], [656, 671], [656, 609], [421, 609], [343, 625],
        [343, 578], [281, 500], [281, 421], [343, 375], [343, 312]
      ],
    },
    {
      id: 'warrior-skin',
      label: 'Pelle',
      confidence: 0.97,
      description: 'Incarnato di viso, orecchie, collo e mano che impugna la spada',
      box_2d: [265, 343, 562, 656],
      polygon: [
        [265, 375], [265, 625], [343, 656], [421, 656], [500, 640],
        [562, 578], [562, 437], [500, 359], [421, 343], [343, 343]
      ],
    },
    {
      id: 'warrior-clothes',
      label: 'Vestiti',
      confidence: 0.98,
      description: 'Tunica medievale in lino chiaro con allacciatura sul petto e maniche ampie',
      box_2d: [609, 93, 1000, 906],
      polygon: [
        [609, 265], [609, 734], [687, 906], [1000, 843], [1000, 156],
        [687, 93], [609, 265]
      ],
    },
  ];
}

/**
 * Generates the Anime Mage character canvas (second diverse character preset)
 * Features: Violet flowing hair, witch hat with gold buckle, crystal staff,
 * large expressive anime eyes, fair skin, and emerald wizard robe.
 */
export function generateMageSampleCanvas(): HTMLCanvasElement {
  const width = 640;
  const height = 640;
  const canvas = createCanvas(width, height);
  const ctx = context(canvas);

  ctx.clearRect(0, 0, width, height);

  // 1. Emerald Robe / Vestiti
  ctx.fillStyle = '#1e7b57';
  ctx.beginPath();
  ctx.moveTo(180, 420);
  ctx.lineTo(260, 390);
  ctx.lineTo(320, 410);
  ctx.lineTo(380, 390);
  ctx.lineTo(460, 420);
  ctx.lineTo(560, 640);
  ctx.lineTo(80, 640);
  ctx.closePath();
  ctx.fill();

  // Robe gold collar trim
  ctx.strokeStyle = '#e6b800';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(260, 390);
  ctx.lineTo(320, 450);
  ctx.lineTo(380, 390);
  ctx.stroke();

  // 2. Crystal Staff & Hat (Accessori)
  // Staff shaft (dark mahogany)
  ctx.fillStyle = '#3d2012';
  ctx.fillRect(490, 180, 24, 460);

  // Crystal orb at top of staff
  ctx.fillStyle = '#48cae4';
  ctx.beginPath();
  ctx.arc(502, 160, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#caf0f8'; // orb shine
  ctx.beginPath();
  ctx.arc(494, 150, 12, 0, Math.PI * 2);
  ctx.fill();

  // Witch hat brim and cone
  ctx.fillStyle = '#2b2353'; // deep midnight purple
  ctx.beginPath();
  ctx.ellipse(320, 140, 180, 45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(210, 140);
  ctx.quadraticCurveTo(320, 10, 430, 40);
  ctx.lineTo(430, 140);
  ctx.closePath();
  ctx.fill();

  // Hat buckle (Gold)
  ctx.fillStyle = '#f9c74f';
  ctx.fillRect(295, 120, 50, 20);

  // 3. Pelle (Face & Neck)
  ctx.fillStyle = '#fceade'; // Fair skin
  ctx.beginPath();
  ctx.moveTo(250, 230);
  ctx.quadraticCurveTo(240, 340, 320, 370); // Chin
  ctx.quadraticCurveTo(400, 340, 390, 230);
  ctx.quadraticCurveTo(320, 170, 250, 230);
  ctx.closePath();
  ctx.fill();

  // Pointed elf/anime ears
  ctx.beginPath();
  ctx.moveTo(245, 250);
  ctx.lineTo(210, 230);
  ctx.lineTo(245, 275);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(395, 250);
  ctx.lineTo(430, 230);
  ctx.lineTo(395, 275);
  ctx.closePath();
  ctx.fill();

  // Neck
  ctx.fillRect(295, 350, 50, 50);

  // 4. Occhi (Big expressive anime eyes - Teal)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(280, 260, 22, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(360, 260, 22, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0077b6';
  ctx.beginPath();
  ctx.arc(280, 260, 14, 0, Math.PI * 2);
  ctx.arc(360, 260, 14, 0, Math.PI * 2);
  ctx.fill();

  // Big anime catchlights
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(275, 254, 5, 0, Math.PI * 2);
  ctx.arc(355, 254, 5, 0, Math.PI * 2);
  ctx.fill();

  // 5. Bocca (Mouth)
  ctx.fillStyle = '#d90429';
  ctx.beginPath();
  ctx.arc(320, 330, 10, 0, Math.PI);
  ctx.fill();

  // 6. Capelli (Violet Hair)
  ctx.fillStyle = '#7b2cbf';
  ctx.beginPath();
  // Bangs
  ctx.moveTo(240, 210);
  ctx.lineTo(260, 250);
  ctx.lineTo(280, 220);
  ctx.lineTo(310, 260);
  ctx.lineTo(330, 220);
  ctx.lineTo(360, 255);
  ctx.lineTo(390, 210);
  // Flowing twin tails / sides
  ctx.quadraticCurveTo(460, 350, 440, 480);
  ctx.quadraticCurveTo(410, 450, 400, 360);
  ctx.lineTo(240, 360);
  ctx.quadraticCurveTo(230, 450, 200, 480);
  ctx.quadraticCurveTo(180, 350, 240, 210);
  ctx.closePath();
  ctx.fill();

  // 7. Lineart / Contorni
  ctx.strokeStyle = '#1b1226';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  return canvas;
}

/**
 * Ground truth semantic parts for Anime Mage (normalized 0-1000).
 */
export function getMageSemanticGroundTruth(): SemanticPart[] {
  return [
    {
      id: 'mage-lineart',
      label: 'Tratto',
      confidence: 0.99,
      description: 'Tratto a china di occhi, labbra, cappello da maga, scettro e vesti',
      box_2d: [62, 125, 1000, 875],
      polygon: [
        [62, 328], [62, 671], [218, 875], [218, 765], [1000, 875],
        [1000, 125], [218, 125], [62, 328]
      ],
    },
    {
      id: 'mage-accessories',
      label: 'Accessori',
      confidence: 0.98,
      description: 'Cappello a punta con fibbia dorata e bastone magico con sfera di cristallo',
      box_2d: [62, 125, 1000, 875],
      polygon: [
        [62, 328], [62, 671], [218, 781], [281, 875], [1000, 843],
        [1000, 765], [250, 750], [218, 218], [62, 328]
      ],
    },
    {
      id: 'mage-eyes',
      label: 'Occhi',
      confidence: 0.99,
      description: 'Grandi occhi anime acquamarina con luci e pupille',
      box_2d: [375, 406, 453, 593],
      polygon: [
        [375, 406], [375, 468], [453, 468], [453, 406],
        [375, 531], [375, 593], [453, 593], [453, 531]
      ],
    },
    {
      id: 'mage-mouth',
      label: 'Bocca',
      confidence: 0.96,
      description: 'Bocca espressiva da maga',
      box_2d: [500, 484, 535, 515],
      polygon: [
        [500, 484], [500, 515], [535, 515], [535, 484]
      ],
    },
    {
      id: 'mage-hair',
      label: 'Capelli',
      confidence: 0.97,
      description: 'Capelli viola fluenti con frangetta sfaccettata e ciocche lunghe',
      box_2d: [312, 281, 750, 718],
      polygon: [
        [312, 375], [312, 625], [562, 718], [750, 687], [562, 625],
        [562, 375], [750, 312], [562, 281], [312, 375]
      ],
    },
    {
      id: 'mage-skin',
      label: 'Pelle',
      confidence: 0.98,
      description: 'Incarnato chiaro di viso, orecchie a punta e collo',
      box_2d: [359, 328, 625, 671],
      polygon: [
        [359, 390], [359, 609], [421, 671], [546, 625], [625, 546],
        [625, 453], [546, 375], [421, 328], [359, 390]
      ],
    },
    {
      id: 'mage-clothes',
      label: 'Vestiti',
      confidence: 0.98,
      description: 'Veste da maga verde smeraldo con bordo dorato',
      box_2d: [609, 125, 1000, 875],
      polygon: [
        [609, 281], [609, 718], [703, 875], [1000, 875], [1000, 125],
        [703, 125], [609, 281]
      ],
    },
  ];
}
