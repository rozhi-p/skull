
/*
SOUND-DRIVEN INTROVERSION CHARACTER
====================================

This example demonstrates sound-based character behavior using microphone input.
The character wants to stay at the bottom (close to viewer) but is driven away
by loud sounds, simulating an introverted personality that retreats from noise.

INTROVERSION SYSTEM:
- Quiet environment increases introversion score (0-100)
- Loud sounds decrease introversion and push character away
- Lower introversion = faster retreat and more agitated breathing
- Character goal: stay at bottom, but noise drives them back

SOUND DETECTION:
- Uses p5-phone's enableMicTap() to request microphone access
- mic.getLevel() returns microphone amplitude (0.0 to 1.0)
- Threshold determines what counts as "loud"
- Real-time microphone level affects character movement

DEPTH SIMULATION:
- Y position simulates depth (top=far, bottom=close)
- Scale changes with position (0.05 at top, 1.5 at bottom)
- Movement speed varies with introversion level
- Animation speed reflects stress level

VISUAL ELEMENTS:
- Perspective corridor lines create 3D space illusion
- Character animations: idle, walk forward, walk back
- Character scales with depth position

KEY METHODS:
- enableMicTap(): Request microphone permissions with tap prompt
- mic.getLevel(): Get current microphone level (0.0 to 1.0)
- mic.enabled: Check if microphone is active
- sprite.changeAni(name): Switch between animations
- sprite.mirror.x: Flip sprite horizontally
- sprite.scale: Control sprite size
- sprite.ani.frameDelay: Control animation speed

LIBRARIES REQUIRED:
- p5.js v1.11.4
- p5.sound (required for p5.AudioIn)
- p5play v3
- p5-phone v1.6.1 (microphone management)
*/

// ==============================================
// GLOBAL VARIABLES
// ==============================================

// Sprite and Animations
let character;               // The animated sprite object
let idleAni;                 // Idle animation (breathing, stationary)
let walkAni;                 // Walk forward animation (toward viewer)
let walkBackAni;             // Walk backward animation (away from viewer)

// Sound Input System
let mic;                     // Microphone input object
let micMultiplier = 3;       // Increase sensitivity
let soundThreshold = 0.09;   // Microphone level that counts as "loud" (0.0-1.0)
let currentLevel = 0;        // Current microphone level

// Introversion System
let introversion = 100;      // Introversion score (0-100, starts at max)
let introversionGainRate = 0.2;    // How fast introversion increases in quiet
let introversionLossRate = 1.0;    // How fast introversion decreases in noise

// Behavior Thresholds (based on introversion level)
let panicThreshold = 30;     // Below this, character panics and runs away
let comfortThreshold = 70;   // Above this, character feels safe to approach

// Movement and Position
let moveSpeed;               // Vertical movement speed (calculated from introversion)
let targetY;                 // Desired Y position (bottom when introverted)

// UI Controls
let showDebugInfo = true;    // Toggle for showing/hiding debug information

// Depth Simulation System
let minScale = 0.05;         // Character scale at top (far away, tiny)
let maxScale = 1.5;          // Character scale at bottom (close up, large)
let minY = 100;              // Top boundary - farthest distance
let maxY;                    // Bottom boundary - closest distance (set in setup)

// Animation Speed Controls
let walkFrameDelay;          // Walk animation frame delay (calculated from introversion)
let idleFrameDelay; 
         // Idle animation frame delay (calculated from introversion)
let SHOW_VIDEO = true;              // Show/hide video feed (toggle with touch)
let SHOW_ALL_KEYPOINTS = true; 

let TRACKED_KEYPOINT_INDEX = 1;     // Which face point to use for interaction

let CURSOR_SIZE = 30;               // Size of the tracking cursor (nose dot)
let CURSOR_COLOR = [255, 50, 50];   // Color of cursor (red)
let KEYPOINT_SIZE = 3;  
let cam;                            // PhoneCamera instance
let facemesh;                       // ML5 FaceMesh model
let faces = [];                     // Detected faces (updated automatically)
let cursor; 
// Nose control for character
let NOSE_CONTROL_ENABLED = true;    // Set to false to disable nose-driven movement
let noseX = null, noseY = null;     // Smoothed nose coordinates in canvas space
let noseSmoothing = 0.12; 
         // 0..1 lerp speed for nose -> character

// ==============================================
// PRELOAD - Load animations before setup
// ==============================================
function preload() {
  // Load idle animation sequence (9 frames)
  idleAni = loadAni('animations/idle/idleAnim_1.png', 15);
  
  // Load walk forward animation sequence (13 frames)
  walkAni = loadAni('animations/walk/walkAnim_1.png', 15);
  
  // Load walk backward animation sequence (13 frames)
  walkBackAni = loadAni('animations/walkBack/walkAnimBack_1.png', 15);
}

// ==============================================
// SETUP - Initialize everything once
// ==============================================
function setup() {
  // Enable debug panel to view errors on mobile (uncomment if needed)
  // showDebug();
  
  // Create portrait canvas matching phone proportions (9:16 aspect ratio)
  createCanvas(405, 720);
  
  // Set bottom boundary (character's closest position)
  maxY = height - 150;
  
  // Create microphone input object (required by p5-phone)
  mic = new p5.AudioIn();
  
  // Enable microphone with tap-to-start (required for microphone permissions)
  enableMicTap();
  
  // Initialize character sprite at bottom center (comfortable position)
  character = new Sprite(width / 2, maxY);
  character.scale = maxScale;  // Start large (close to viewer)
  
  // Configure sprite physics
  // 'kinematic' = manual position control, no gravity or physics simulation
  character.physics = 'kinematic';
  
  // Add all three animations to the sprite with names for switching
  character.addAni('idle', idleAni);
  character.addAni('walk', walkAni);
  character.addAni('walkBack', walkBackAni);
  
  // Set initial animation state
  character.changeAni('idle');
  character.ani.frameDelay = 8;  // Calm breathing initially

  // Initialize camera for FaceMesh
  cam = createPhoneCamera('user', true, 'fitHeight');
  enableCameraTap();

  cam.onReady(() => {
    let options = {
      maxFaces: 1,           // Only detect 1 face (faster)
      refineLandmarks: false,// Skip detailed landmarks (faster)
      runtime: 'mediapipe',  // Use MediaPipe runtime (same as HandPose)
      flipHorizontal: false  // Don't flip in ML5 - cam.mapKeypoint() handles mirroring
    };
    
    facemesh = ml5.faceMesh(options, () => {
      facemesh.detectStart(cam.videoElement, gotFaces);
    });
  });

  // Initialize smiley sprites

}

function gotFaces(results) {
  faces = results;
}

// ==============================================
// DRAW - Main game loop (runs continuously at 60fps)
// ==============================================
function draw() {
  // Clear background with sky blue color
  background(100, 150, 200);
  
  // Check if microphone is enabled (user has granted microphone permission)
  if (mic && mic.enabled) {
    // Step 1: Read current microphone level
    currentLevel = mic.getLevel() * micMultiplier;
    currentLevel = constrain(currentLevel, 0, 1);
    
    // Step 2: Update introversion based on sound level
    updateIntroversion();
    
    // Step 3: Calculate movement speed based on introversion
    // Lower introversion = faster retreat (more stressed)
    moveSpeed = map(introversion, 0, 100, 2.0, 0.3);
    
    // Step 4: Determine character behavior based on introversion level and sound
    if (currentLevel > soundThreshold) {
      // NOISE DETECTED - Lose confidence, potentially retreat
      if (introversion < panicThreshold) {
        // LOW INTROVERSION - Panicked! Run away to top
        targetY = minY;
        moveCharacterTowardTarget();
      } else {
        // MODERATE INTROVERSION - Uncomfortable, stop and wait
        stopCharacter();
      }
    } else {
      // QUIET ENVIRONMENT
      if (introversion > comfortThreshold) {
        // HIGH INTROVERSION - Confident enough to approach bottom
        targetY = maxY;
        moveCharacterTowardTarget();
      } else {
        // LOW/MODERATE INTROVERSION - Stay put, recovering
        stopCharacter();
      }
    }
    
    // Step 5: Update character scale to simulate depth
    updateDepthScale();
    
    // Step 6: Keep character within defined boundaries
    character.y = constrain(character.y, minY, maxY);
  } else {
    // Microphone not enabled yet - keep character idle at bottom
    stopCharacter();
  }

    if (faces.length > 0) {
      drawFaceTracking();
      // Use nose position to control character (optional)
      if (noseX !== null) noseControlCharacter();
    }

  // Draw nose ellipse (tracking cursor)
  if (noseX !== null) {
    push();
    noStroke();
    fill(CURSOR_COLOR[0], CURSOR_COLOR[1], CURSOR_COLOR[2], 220);
    ellipse(noseX, noseY, CURSOR_SIZE, CURSOR_SIZE);
    pop();
  }

  // Check smiley collisions with character
  for (let i = smileys.length - 1; i >= 0; i--) {
    if (smileys[i].overlaps(character)) {
      smileys[i].remove();
      smileys.splice(i, 1);
    }
  }
  
  // Step 7: Draw perspective lines and visual elements
  drawPerspective();
  
  // Step 8: Draw UI information
  drawUI();
}

function drawFaceTracking() {
  let face = faces[0];  // Ge
 if (!face.keypoints || face.keypoints.length === 0) return;
  
 let trackedKeypoint = face.keypoints[TRACKED_KEYPOINT_INDEX];
  if (!trackedKeypoint) return;
  // Map ML5/camera keypoint into canvas coordinates using p5-phone helper
 cursor = cam.mapKeypoint(trackedKeypoint);

 // Update smoothed nose coordinates used for drawing and control
 if (cursor && cursor.x !== undefined && cursor.y !== undefined) {
   // Lerp for smooth movement
   if (noseX === null) {
     noseX = cursor.x;
     noseY = cursor.y;
   } else {
     noseX = lerp(noseX, cursor.x, noseSmoothing);
     noseY = lerp(noseY, cursor.y, noseSmoothing);
   }
 }
}

/**
 * Gently move the character based on the nose position.
 * This nudges the character horizontally toward the user's nose
 * and applies a small vertical offset without fully overriding
 * the existing introversion movement system.
 */
function noseControlCharacter() {
  if (!NOSE_CONTROL_ENABLED || noseX === null) return;

  // Horizontal control: map nose X to canvas X (camera mapping already applied)
  let targetX = constrain(noseX, 0, width);
  // Smoothly move character horizontally toward targetX
  character.x = lerp(character.x, targetX, 0.12);

  // Vertical soft influence: small offset toward nose Y but keep primary introversion logic
  // We'll nudge character.y a little based on nose vertical position to add feel.
  let verticalNudge = map(noseY, 0, height, -20, 20); // -20..20 px
  character.y = constrain(lerp(character.y, character.y + verticalNudge, 0.06), minY, maxY);
}

// ==============================================
// INTROVERSION SYSTEM
// ==============================================

/**
 * Update Introversion Score
 * 
 * Tracks the character's comfort level based on environmental noise.
 * Quiet increases introversion (more comfortable, willing to be close).
 * Loud sounds decrease introversion (stressed, wants to retreat).
 */
function updateIntroversion() {
  if (currentLevel > soundThreshold) {
    // LOUD - Decrease introversion (getting stressed)
    introversion -= introversionLossRate;
  } else {
    // QUIET - Increase introversion (getting comfortable)
    introversion += introversionGainRate;
  }
  
  // Keep introversion within valid range
  introversion = constrain(introversion, 0, 100);
}

// ==============================================
// MOVEMENT FUNCTIONS
// ==============================================

/**
 * Move Character Toward Target Position
 * 
 * Smoothly moves character toward targetY (either top or bottom).
 * Uses different animations based on direction of movement.
 * Speed is determined by introversion level (stressed = faster).
 */
function moveCharacterTowardTarget() {
  let distanceToTarget = targetY - character.y;
  
  if (abs(distanceToTarget) > 5) {  // Only move if not close enough
    
    if (distanceToTarget > 0) {
      // MOVING DOWN (toward viewer/bottom)
      moveCharacterDown();
    } else {
      // MOVING UP (away from viewer/top)
      moveCharacterUp();
    }
    
  } else {
    // AT TARGET - Stop and idle
    stopCharacter();
  }
  
  // Update animation speed based on stress level
  updateAnimationSpeeds();
}

/**
 * Move Character Toward Bottom (Getting Closer)
 * 
 * Character walks DOWN the screen toward the viewer (comfortable position).
 * Used when environment is quiet and introversion is high.
 */
function moveCharacterDown() {
  // Boundary check: Stop movement if character reached bottom
  if (character.y >= maxY) {
    stopCharacter();
    return;
  }
  
  // Move character down screen (increasing Y position)
  character.y += moveSpeed;
  
  // Optimization: Only switch animation if not already walking
  if (character.ani.name !== 'walk') {
    character.changeAni('walk');
  }
  
  // Set direction: Face forward (toward viewer)
  character.mirror.x = false;
}

/**
 * Move Character Toward Top (Retreating)
 * 
 * Character walks UP the screen away from viewer (retreat position).
 * Used when environment is loud and character is stressed.
 */
function moveCharacterUp() {
  // Move character up screen (decreasing Y position)
  character.y -= moveSpeed;
  
  // Optimization: Only switch animation if not already walking backward
  if (character.ani.name !== 'walkBack') {
    character.changeAni('walkBack');
  }
  
  // No mirroring needed - walkBack animation shows proper back-facing view
  character.mirror.x = false;
}

/**
 * Stop Character (Idle State)
 * 
 * Switches character to idle/standing animation.
 * Used when character reaches target position.
 */
function stopCharacter() {
  // Clear any velocity (safety measure for kinematic physics)
  character.vel.x = 0;
  character.vel.y = 0;
  
  // Optimization: Only switch animation if not already idle
  if (character.ani.name !== 'idle') {
    character.changeAni('idle');
  }
  
  // Reset direction: Face forward
  character.mirror.x = false;
}

/**
 * Update Animation Speeds
 * 
 * Adjusts animation playback speed based on introversion level.
 * Lower introversion (more stressed) = faster animations (agitated breathing).
 * Higher introversion (comfortable) = slower animations (calm breathing).
 */
function updateAnimationSpeeds() {
  // Walk animation: stressed character moves frantically
  walkFrameDelay = int(map(introversion, 0, 100, 2, 8));
  
  // Idle animation: stressed character breathes faster
  idleFrameDelay = int(map(introversion, 0, 100, 2, 12));
  
  // Apply current frame delay to active animation
  character.ani.frameDelay = (character.ani.name === 'idle') ? idleFrameDelay : walkFrameDelay;
}

// ==============================================
// DEPTH SCALE SYSTEM
// ==============================================

/**
 * Update Depth Scale
 * 
 * Creates the illusion of 3D depth by changing the character's
 * size based on vertical position. Objects farther away (top) appear smaller,
 * while objects closer (bottom) appear larger.
 * 
 * The scale ranges from 0.05 (tiny/far) to 1.5 (large/close).
 */
function updateDepthScale() {
  // Calculate scale based on Y position using linear mapping
  // minY (top) → minScale (0.05 = tiny, far away)
  // maxY (bottom) → maxScale (1.5 = large, close up)
  let newScale = map(character.y, minY, maxY, minScale, maxScale);
  
  // Apply calculated scale to character sprite
  character.scale = newScale;
}

// ==============================================
// VISUAL ELEMENTS - Draw perspective corridor
// ==============================================

/**
 * Draw Perspective Corridor
 * 
 * Creates a simple 3D corridor effect using 4 lines that form walls
 * and a back boundary. This helps reinforce the depth illusion.
 * 
 * Visual Structure:
 * - 2 angled lines from bottom corners converge toward top center
 * - 1 horizontal line at back connects the converging lines
 * - 2 vertical lines extend from back to top of canvas (walls)
 */
function drawPerspective() {
  // Start drawing context with semi-transparent white lines
  push();
  stroke(255, 150);  // White with 150 alpha (semi-transparent)
  strokeWeight(2);
  
  // LEFT GROUND/WALL LINE
  // Starts at bottom-left corner, angles toward upper-center (40% width)
  // Creates converging perspective effect
  line(0, height, width * 0.4, minY);
  
  // RIGHT GROUND/WALL LINE
  // Starts at bottom-right corner, angles toward upper-center (60% width)
  // Mirrors left line to complete perspective convergence
  line(width, height, width * 0.6, minY);
  
  // BACK WALL HORIZONTAL LINE
  // Connects the two angled lines at minY (back boundary)
  // Forms the "back wall" of the corridor
  line(width * 0.4, minY, width * 0.6, minY);
  
  // LEFT VERTICAL WALL
  // Extends from back wall connection point to top of canvas
  // Forms left side of corridor
  line(width * 0.4, minY, width * 0.4, 0);
  
  // RIGHT VERTICAL WALL
  // Extends from back wall connection point to top of canvas
  // Forms right side of corridor
  line(width * 0.6, minY, width * 0.6, 0);
  
  pop();  // Restore drawing context
}

/**
 * Draw UI Information
 * 
 * Displays current sound level and introversion score for debugging
 * and visual feedback. Can be toggled with touch/click.
 */
function drawUI() {
  // Only show debug info if enabled
  if (!showDebugInfo) return;
  
  push();
  fill(255);
  textSize(16);
  textAlign(LEFT, TOP);
  
  // Display sound level with visual indicator
  text(`Sound Level: ${nf(currentLevel, 1, 3)}`, 10, 10);
  text(`Threshold: ${soundThreshold}`, 10, 30);
  
  // Display introversion score
  text(`Introversion: ${nf(introversion, 1, 1)}`, 10, 60);
  
  // Visual bar for introversion level
  let barWidth = map(introversion, 0, 100, 0, 200);
  noStroke();
  fill(100, 200, 100);
  rect(10, 85, barWidth, 15);
  
  // Visual bar for sound level
  let soundBarWidth = map(currentLevel, 0, 0.5, 0, 200);
  fill(200, 100, 100);
  rect(10, 110, soundBarWidth, 15);
  
  // Show toggle instruction
  fill(255, 200);
  textSize(12);
  text('Tap to hide/show info', 10, 135);
  
  pop();
}



// ==============================================
// TOUCH EVENT HANDLERS - Prevent default browser behavior
// ==============================================

/**
 * Touch Started Handler
 * 
 * Toggles debug information visibility on touch/click.
 * Also prevents default mobile browser behavior.
 */
// (touchStarted removed here — using the camera toggle below)

/**
 * Touch Ended Handler
 * 
 * Prevents default mobile browser behavior when touch is released.
 * Ensures consistent interaction experience across devices.
 */
function touchStarted() {
  SHOW_VIDEO = !SHOW_VIDEO;
  return false;  // Prevent default to avoid interfering with camera/ML5
}
function touchEnded() {
  return false;  // Returning false prevents default behavior
}

/**
 * Mouse Pressed Handler
 * 
 * Toggles debug information visibility on mouse click (for desktop testing).
 */
function mousePressed() {
  // Toggle debug info visibility
  showDebugInfo = !showDebugInfo;

}
