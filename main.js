(() => {
  const canvas = document.getElementById("pond");
  const ctx = canvas.getContext("2d", { alpha: false });
  const metricsEl = document.getElementById("metrics");
  const controlPanelEl = document.getElementById("controlPanel");
  const togglePanelBtnEl = document.getElementById("togglePanel");

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const PondConfig = {
    fishCount: 20,
    minSpeed: 24,
    maxSpeed: 82,
    chaseBoost: 42,
    turnRate: 2.2,
    senseRadius: 240,
    feedCooldownMs: 80,
    maxFood: isMobile ? 44 : 66,
    maxParticles: isMobile ? 100 : 150,
    hungerGain: 0.075,
    hungerDecay: 1.15,
    foodLife: 8.5,
    boundaryPadding: 80,
    fpsDegradeThreshold: 43,
    fpsRecoverThreshold: 54,
    rippleLife: 1.25,
    maxRipples: isMobile ? 22 : 36,
    separationRadius: 42,
    alignmentRadius: 78,
    cohesionRadius: 96,
    separationWeight: 0.95,
    alignmentWeight: 0.45,
    cohesionWeight: 0.28,
    lilyCount: isMobile ? 3 : 4,
    lilyRadius: 62,
    lilyAttractWeight: 0.62,
    lilyHomeRadiusFactor: 3.2,
    lilyReturnWeight: 0.7,
    lilyCapacityFactor: 0.2,
    lilyRoamSwitchMin: 1.8,
    lilyRoamSwitchMax: 4.2,
    maxFishLevel: 8,
    foodsPerLevel: 10,
    topLevelDigestEvery: 3,
    topLevelDigestDuration: 9.5,
    digestAppetiteFactor: 0.06,
  };

  const world = {
    width: 0,
    height: 0,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    time: 0,
    lastFeedTs: 0,
    fpsSamples: [],
    degradeLevel: 0,
  };

  const foods = [];
  const particles = [];
  const ripples = [];
  const lilies = [];
  let nextFoodId = 1;
  let nextParticleId = 1;
  let nextRippleId = 1;

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const panelStateMemory = { collapsed: "0" };
  const sizeByLevel = [0.62, 0.78, 0.98, 1.22, 1.5, 1.82, 2.18, 2.58];

  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function createFish(id) {
    const angle = rand(0, Math.PI * 2);
    const level = Math.floor(rand(1, 4));
    return {
      id,
      x: rand(0, world.width),
      y: rand(0, world.height),
      vx: Math.cos(angle) * rand(18, 40),
      vy: Math.sin(angle) * rand(18, 40),
      angle,
      speed: rand(PondConfig.minSpeed, PondConfig.maxSpeed),
      hunger: rand(0.2, 1),
      targetFoodId: null,
      spriteState: "normal",
      flip: 1,
      frameTime: rand(0, 10),
      size: sizeByLevel[level - 1],
      wanderTimer: rand(0.8, 4.5),
      wanderAngle: angle,
      level,
      foodsEatenAtLevel: 0,
      topLevelDigestCounter: 0,
      digestTimer: 0,
      preferredLilyId: null,
      roamLilyA: null,
      roamLilyB: null,
      roamTargetId: null,
      roamTimer: 0,
    };
  }

  const fishes = [];

  function syncFishCount() {
    const target = Math.max(1, Math.floor(PondConfig.fishCount));
    while (fishes.length < target) fishes.push(createFish(fishes.length + 1));
    while (fishes.length > target) fishes.pop();
  }

  function resize() {
    world.dpr = Math.min(window.devicePixelRatio || 1, 2);
    world.width = window.innerWidth;
    world.height = window.innerHeight;
    canvas.width = Math.floor(world.width * world.dpr);
    canvas.height = Math.floor(world.height * world.dpr);
    canvas.style.width = `${world.width}px`;
    canvas.style.height = `${world.height}px`;
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
    regenerateLilies();
  }

  function regenerateLilies() {
    lilies.length = 0;
    if (world.width <= 0 || world.height <= 0) return;
    const margin = 120;
    const maxAttemptsPerLily = 180;
    const minGap = 12;

    for (let i = 0; i < PondConfig.lilyCount; i += 1) {
      let placed = false;
      for (let attempt = 0; attempt < maxAttemptsPerLily; attempt += 1) {
        const shrink = attempt > 90 ? 0.85 : 1;
        const r = rand(PondConfig.lilyRadius * 0.72, PondConfig.lilyRadius * 1.15) * shrink;
        const x = rand(margin, Math.max(margin + 1, world.width - margin));
        const y = rand(margin, Math.max(margin + 1, world.height - margin));

        let overlaps = false;
        for (let j = 0; j < lilies.length; j += 1) {
          const other = lilies[j];
          const dx = x - other.x;
          const dy = y - other.y;
          const d = Math.hypot(dx, dy);
          if (d < r + other.r + minGap) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        lilies.push({
          id: i + 1,
          x,
          y,
          r,
          phase: rand(0, Math.PI * 2),
          capacity: Math.max(6, Math.round(r * PondConfig.lilyCapacityFactor)),
        });
        placed = true;
        break;
      }
      if (!placed) {
        // Fallback in extreme small viewports: place a small leaf without overlap guarantees.
        const r = PondConfig.lilyRadius * 0.68;
        lilies.push({
          id: i + 1,
          x: rand(margin, Math.max(margin + 1, world.width - margin)),
          y: rand(margin, Math.max(margin + 1, world.height - margin)),
          r,
          phase: rand(0, Math.PI * 2),
          capacity: Math.max(6, Math.round(r * PondConfig.lilyCapacityFactor)),
        });
      }
    }
  }

  function getLilyById(id) {
    return lilies.find((l) => l.id === id) || null;
  }

  function pickBestLilyWithCapacity(fish, lilyLoads) {
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < lilies.length; i += 1) {
      const lily = lilies[i];
      const current = lilyLoads.get(lily.id) || 0;
      if (current + fish.level > lily.capacity) continue;
      const dx = lily.x - fish.x;
      const dy = lily.y - fish.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestScore) {
        bestScore = d2;
        best = lily;
      }
    }
    return best;
  }

  function findTwoNearestLilies(fish) {
    if (lilies.length === 0) return [null, null];
    let first = null;
    let second = null;
    let d1 = Number.POSITIVE_INFINITY;
    let d2 = Number.POSITIVE_INFINITY;
    for (let i = 0; i < lilies.length; i += 1) {
      const lily = lilies[i];
      const dx = lily.x - fish.x;
      const dy = lily.y - fish.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < d1) {
        second = first;
        d2 = d1;
        first = lily;
        d1 = dist2;
      } else if (dist2 < d2) {
        second = lily;
        d2 = dist2;
      }
    }
    return [first, second || first];
  }

  function spawnFood(x, y) {
    if (foods.length >= PondConfig.maxFood - world.degradeLevel * 10) return;
    foods.push({
      id: nextFoodId++,
      x,
      y: y - rand(6, 22),
      vx: rand(-15, 15),
      vy: rand(4, 22),
      life: PondConfig.foodLife,
      isClaimed: false,
    });
  }

  function spawnParticles(x, y, count) {
    const maxAllowed = PondConfig.maxParticles - world.degradeLevel * 35;
    if (particles.length >= maxAllowed) return;
    const c = Math.min(count, maxAllowed - particles.length);
    for (let i = 0; i < c; i += 1) {
      particles.push({
        id: nextParticleId++,
        x,
        y,
        vx: rand(-40, 40),
        vy: rand(-40, 20),
        life: rand(0.45, 0.9),
        maxLife: 0,
        r: rand(1.2, 2.7),
      });
      particles[particles.length - 1].maxLife = particles[particles.length - 1].life;
    }
  }

  function spawnRipple(x, y, strength = 1) {
    const maxAllowed = PondConfig.maxRipples - world.degradeLevel * 8;
    if (ripples.length >= Math.max(6, maxAllowed)) ripples.shift();
    ripples.push({
      id: nextRippleId++,
      x,
      y,
      life: PondConfig.rippleLife * (0.85 + strength * 0.25),
      maxLife: 0,
      radius: 8,
      speed: 56 + strength * 20,
      width: 2.4 + strength * 0.8,
    });
    ripples[ripples.length - 1].maxLife = ripples[ripples.length - 1].life;
  }

  function nearestFoodForFish(fish) {
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < foods.length; i += 1) {
      const food = foods[i];
      const dx = food.x - fish.x;
      const dy = food.y - fish.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > PondConfig.senseRadius * PondConfig.senseRadius) continue;
      const noise = rand(0, 9000);
      const claimedPenalty = food.isClaimed ? 15000 : 0;
      const appetiteFactor = fish.digestTimer > 0 ? PondConfig.digestAppetiteFactor : 1;
      const hungerBias = (1 - fish.hunger) * 4000 + (1 - appetiteFactor) * 22000;
      const score = d2 + noise + claimedPenalty + hungerBias;
      if (score < bestScore) {
        bestScore = score;
        best = food;
      }
    }
    return best;
  }

  function ensureTargets() {
    for (let i = 0; i < fishes.length; i += 1) {
      const fish = fishes[i];
      const hasTarget = foods.some((f) => f.id === fish.targetFoodId);
      if (!hasTarget) {
        fish.targetFoodId = null;
      }
      if (!fish.targetFoodId && foods.length > 0) {
        const candidate = nearestFoodForFish(fish);
        if (candidate) {
          fish.targetFoodId = candidate.id;
          candidate.isClaimed = true;
        }
      }
    }
  }

  function avoidBoundary(fish, dt, edgePadding) {
    const p = edgePadding;
    const maxX = world.width - p;
    const maxY = world.height - p;
    let pushX = 0;
    let pushY = 0;

    if (fish.x < p) pushX = (p - fish.x) / p;
    else if (fish.x > maxX) pushX = -((fish.x - maxX) / p);

    if (fish.y < p) pushY = (p - fish.y) / p;
    else if (fish.y > maxY) pushY = -((fish.y - maxY) / p);

    if (pushX === 0 && pushY === 0) return;

    const targetA = Math.atan2(pushY, pushX);
    const d = angleDiff(fish.angle, targetA);
    fish.angle += d * Math.min(1, dt * 1.6);

    // Dampen velocity against the boundary normal to avoid edge jitter.
    fish.vx += pushX * 22 * dt;
    fish.vy += pushY * 22 * dt;
    if (pushX !== 0) fish.vx *= 0.92;
    if (pushY !== 0) fish.vy *= 0.92;
  }

  function updateFish(fish, dt, lilyLoads) {
    fish.digestTimer = Math.max(0, fish.digestTimer - dt);
    fish.hunger = clamp(fish.hunger + PondConfig.hungerGain * dt, 0, 2);
    if (fish.digestTimer > 0) {
      fish.hunger = Math.min(fish.hunger, 0.08);
      if (Math.random() < 0.02) fish.targetFoodId = null;
    }
    fish.wanderTimer -= dt;
    if (fish.wanderTimer <= 0) {
      fish.wanderTimer = rand(1, 4.6);
      fish.wanderAngle = fish.angle + rand(-1.1, 1.1);
    }

    let targetAngle = fish.wanderAngle;
    let targetSpeed = fish.speed;
    let chasing = false;
    let activeFood = null;
    let sepX = 0;
    let sepY = 0;
    let aliX = 0;
    let aliY = 0;
    let cohX = 0;
    let cohY = 0;
    let aliCount = 0;
    let cohCount = 0;
    let lilySteerX = 0;
    let lilySteerY = 0;

    for (let i = 0; i < fishes.length; i += 1) {
      const other = fishes[i];
      if (other.id === fish.id) continue;
      const dx = other.x - fish.x;
      const dy = other.y - fish.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 0.0001) continue;

      const sepR2 = PondConfig.separationRadius * PondConfig.separationRadius;
      const aliR2 = PondConfig.alignmentRadius * PondConfig.alignmentRadius;
      const cohR2 = PondConfig.cohesionRadius * PondConfig.cohesionRadius;

      if (d2 < sepR2) {
        const inv = 1 / d2;
        sepX -= dx * inv;
        sepY -= dy * inv;
      }
      if (d2 < aliR2) {
        aliX += other.vx;
        aliY += other.vy;
        aliCount += 1;
      }
      if (d2 < cohR2) {
        cohX += other.x;
        cohY += other.y;
        cohCount += 1;
      }
    }

    // Keep fish under a lily if there is capacity; otherwise roam between nearby lilies.
    const currentPreferred = getLilyById(fish.preferredLilyId);
    if (currentPreferred) {
      const currLoad = lilyLoads.get(currentPreferred.id) || 0;
      if (currLoad + fish.level > currentPreferred.capacity) {
        fish.preferredLilyId = null;
      }
    }

    if (!fish.preferredLilyId) {
      const candidate = pickBestLilyWithCapacity(fish, lilyLoads);
      if (candidate) {
        fish.preferredLilyId = candidate.id;
        fish.roamLilyA = null;
        fish.roamLilyB = null;
        fish.roamTargetId = null;
      } else {
        const [a, b] = findTwoNearestLilies(fish);
        fish.roamLilyA = a ? a.id : null;
        fish.roamLilyB = b ? b.id : null;
        if (!fish.roamTargetId) fish.roamTargetId = fish.roamLilyA || fish.roamLilyB;
      }
    }

    if (fish.preferredLilyId) {
      const preferred = getLilyById(fish.preferredLilyId);
      if (preferred) {
        lilyLoads.set(preferred.id, (lilyLoads.get(preferred.id) || 0) + fish.level);
        const dx = preferred.x - fish.x;
        const dy = preferred.y - fish.y;
        const dist = Math.hypot(dx, dy);
        const attractR = preferred.r * 2.8;
        if (dist > 0.001) {
          const influence = clamp(1 - dist / attractR, 0.12, 1);
          lilySteerX += (dx / dist) * influence;
          lilySteerY += (dy / dist) * influence;
        }
      }
    } else if (fish.roamLilyA || fish.roamLilyB) {
      const la = getLilyById(fish.roamLilyA);
      const lb = getLilyById(fish.roamLilyB);
      if (!fish.roamTargetId) fish.roamTargetId = la ? la.id : lb ? lb.id : null;
      fish.roamTimer -= dt;
      const target = getLilyById(fish.roamTargetId);
      if (target) {
        const dx = target.x - fish.x;
        const dy = target.y - fish.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001) {
          lilySteerX += dx / dist;
          lilySteerY += dy / dist;
        }
        const nearTarget = dist < target.r * 1.25;
        if (nearTarget || fish.roamTimer <= 0) {
          const next = fish.roamTargetId === fish.roamLilyA ? fish.roamLilyB : fish.roamLilyA;
          fish.roamTargetId = next || fish.roamTargetId;
          fish.roamTimer = rand(PondConfig.lilyRoamSwitchMin, PondConfig.lilyRoamSwitchMax);
        }
      }
    }

    if (fish.targetFoodId != null) {
      const food = foods.find((f) => f.id === fish.targetFoodId);
      if (food) {
        activeFood = food;
        const dx = food.x - fish.x;
        const dy = food.y - fish.y;
        targetAngle = Math.atan2(dy, dx);
        const appetiteFactor = fish.digestTimer > 0 ? PondConfig.digestAppetiteFactor : 1;
        targetSpeed = clamp(
          fish.speed + PondConfig.chaseBoost * (0.3 + fish.hunger * 0.5) * appetiteFactor,
          PondConfig.minSpeed,
          PondConfig.maxSpeed + PondConfig.chaseBoost
        );
        chasing = true;

        // Use mouth-point hit test so food is consumed near the head, not body center.
        const mouthOffset = 14 * fish.size;
        const mouthX = fish.x + Math.cos(fish.angle) * mouthOffset;
        const mouthY = fish.y + Math.sin(fish.angle) * mouthOffset;
        const mouthDist = Math.hypot(food.x - mouthX, food.y - mouthY);
        if (mouthDist < 7.5 * fish.size) {
          fish.targetFoodId = null;
          fish.hunger = clamp(fish.hunger - PondConfig.hungerDecay, 0, 2);
          fish.foodsEatenAtLevel += 1;

          if (fish.level < PondConfig.maxFishLevel && fish.foodsEatenAtLevel >= PondConfig.foodsPerLevel) {
            fish.level += 1;
            fish.foodsEatenAtLevel = 0;
            fish.size = sizeByLevel[fish.level - 1];
          } else if (fish.level >= PondConfig.maxFishLevel) {
            fish.topLevelDigestCounter += 1;
            if (fish.topLevelDigestCounter >= PondConfig.topLevelDigestEvery) {
              fish.topLevelDigestCounter = 0;
              fish.digestTimer = PondConfig.topLevelDigestDuration;
              fish.hunger = 0;
            }
          }

          const idx = foods.findIndex((f) => f.id === food.id);
          if (idx >= 0) foods.splice(idx, 1);
          spawnParticles(food.x, food.y, 7);
          spawnRipple(food.x, food.y, 1.1);
        }
      } else {
        fish.targetFoodId = null;
      }
    }

    // While chasing food, allow fish to approach edges more closely.
    const chaseEdgePadding = 12;
    const freeSwimPadding = PondConfig.boundaryPadding;
    let edgePadding = chasing ? chaseEdgePadding : freeSwimPadding;
    if (activeFood) {
      const isFoodNearEdge =
        activeFood.x < freeSwimPadding ||
        activeFood.x > world.width - freeSwimPadding ||
        activeFood.y < freeSwimPadding ||
        activeFood.y > world.height - freeSwimPadding;
      if (isFoodNearEdge) edgePadding = chaseEdgePadding;
    }
    avoidBoundary(fish, dt, edgePadding);

    // Boids-like steering for more natural school movement.
    let steerX = 0;
    let steerY = 0;
    if (sepX !== 0 || sepY !== 0) {
      steerX += sepX * PondConfig.separationWeight;
      steerY += sepY * PondConfig.separationWeight;
    }
    if (aliCount > 0) {
      const avx = aliX / aliCount;
      const avy = aliY / aliCount;
      steerX += (avx - fish.vx) * PondConfig.alignmentWeight * 0.02;
      steerY += (avy - fish.vy) * PondConfig.alignmentWeight * 0.02;
    }
    if (cohCount > 0) {
      const cx = cohX / cohCount;
      const cy = cohY / cohCount;
      steerX += (cx - fish.x) * PondConfig.cohesionWeight * 0.01;
      steerY += (cy - fish.y) * PondConfig.cohesionWeight * 0.01;
    }
    if (steerX !== 0 || steerY !== 0) {
      const steerA = Math.atan2(steerY, steerX);
      const mix = chasing ? 0.15 : 0.38;
      targetAngle += angleDiff(targetAngle, steerA) * mix;
    }

    if (lilySteerX !== 0 || lilySteerY !== 0) {
      const lilyA = Math.atan2(lilySteerY, lilySteerX);
      const lilyMix = chasing ? 0.08 : PondConfig.lilyAttractWeight;
      targetAngle += angleDiff(targetAngle, lilyA) * Math.min(0.72, lilyMix);
    }

    // If fish is far from all lilies, add a stronger "return to lily zone" steering.
    let nearestLily = null;
    let nearestD2 = Number.POSITIVE_INFINITY;
    for (let i = 0; i < lilies.length; i += 1) {
      const lily = lilies[i];
      const dx = lily.x - fish.x;
      const dy = lily.y - fish.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearestLily = lily;
      }
    }
    if (nearestLily) {
      const dx = nearestLily.x - fish.x;
      const dy = nearestLily.y - fish.y;
      const dist = Math.sqrt(nearestD2);
      const homeRadius = nearestLily.r * PondConfig.lilyHomeRadiusFactor;
      if (dist > homeRadius) {
        const homeAngle = Math.atan2(dy, dx);
        const over = Math.min(1, (dist - homeRadius) / (homeRadius * 1.6));
        const returnMix = (chasing ? 0.12 : PondConfig.lilyReturnWeight) * (0.5 + over);
        targetAngle += angleDiff(targetAngle, homeAngle) * Math.min(0.72, returnMix);
      }
    }

    const delta = angleDiff(fish.angle, targetAngle);
    const turnLimit = PondConfig.turnRate * dt;
    const turn = clamp(delta, -turnLimit, turnLimit);
    fish.angle += turn;

    const speedCurrent = Math.hypot(fish.vx, fish.vy);
    const speed = speedCurrent + (targetSpeed - speedCurrent) * Math.min(1, dt * 1.55);
    fish.vx = Math.cos(fish.angle) * speed;
    fish.vy = Math.sin(fish.angle) * speed;

    fish.x += fish.vx * dt;
    fish.y += fish.vy * dt;

    // Keep fish slightly inside bounds to avoid hard clamp oscillation at exact edge.
    fish.x = clamp(fish.x, 1, world.width - 1);
    fish.y = clamp(fish.y, 1, world.height - 1);

    fish.spriteState = chasing ? "chase" : "normal";
    fish.flip = 1;
    fish.frameTime += dt * (chasing ? 14 : 8) * (0.7 + speed / 120);
  }

  function updateFoods(dt) {
    for (let i = foods.length - 1; i >= 0; i -= 1) {
      const food = foods[i];
      food.vy += 16 * dt;
      food.vx *= Math.pow(0.985, dt * 60);
      food.vy *= Math.pow(0.992, dt * 60);
      food.x += food.vx * dt;
      food.y += food.vy * dt;
      food.life -= dt;
      if (food.y > world.height - 8) {
        food.y = world.height - 8;
        food.vy *= -0.2;
      }
      if (food.life <= 0) foods.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.vy += 38 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updateRipples(dt) {
    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const r = ripples[i];
      r.radius += r.speed * dt;
      r.life -= dt;
      if (r.life <= 0) ripples.splice(i, 1);
    }
  }

  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, world.height);
    g.addColorStop(0, "#1b7ea3");
    g.addColorStop(0.5, "#0f4f68");
    g.addColorStop(1, "#0b2c41");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, world.width, world.height);

    if (world.degradeLevel >= 2) return;

    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 12; i += 1) {
      const y = (i / 12) * world.height;
      const x = ((Math.sin(t * 0.00035 + i * 2.8) + 1) * 0.5) * world.width;
      const rg = ctx.createRadialGradient(x, y, 10, x, y, 180);
      rg.addColorStop(0, "rgba(183,235,255,0.9)");
      rg.addColorStop(1, "rgba(183,235,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(x - 190, y - 190, 380, 380);
    }
    ctx.globalAlpha = 1;
  }

  function drawLilies(t) {
    for (let i = 0; i < lilies.length; i += 1) {
      const lily = lilies[i];
      const wobble = Math.sin(t * 0.001 + lily.phase) * 2.2;
      const r = lily.r + wobble;

      ctx.fillStyle = "rgba(77, 145, 68, 0.92)";
      ctx.beginPath();
      ctx.arc(lily.x, lily.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(118, 175, 95, 0.92)";
      ctx.beginPath();
      ctx.arc(lily.x - r * 0.18, lily.y - r * 0.15, r * 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(37, 85, 38, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lily.x, lily.y);
      ctx.lineTo(lily.x + r * 0.9, lily.y - r * 0.1);
      ctx.stroke();

      // Optional subtle capacity hint ring.
      if (world.degradeLevel === 0) {
        ctx.strokeStyle = "rgba(208, 244, 206, 0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(lily.x, lily.y, r * 2.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawFishBody(fish) {
    const w = 34 * fish.size;
    const h = 16 * fish.size;
    const tailSwing = Math.sin(fish.frameTime) * (fish.spriteState === "chase" ? 0.65 : 0.35);
    const levelT = (fish.level - 1) / Math.max(1, PondConfig.maxFishLevel - 1);

    ctx.save();
    ctx.translate(fish.x, fish.y);
    ctx.rotate(fish.angle);

    const bodyGradient = ctx.createLinearGradient(-w * 0.55, -h, w * 0.35, h);
    bodyGradient.addColorStop(0, "#ffeeb0");
    bodyGradient.addColorStop(0.55, `hsl(${30 - levelT * 8} 100% ${65 - levelT * 8}%)`);
    bodyGradient.addColorStop(1, `hsl(${17 - levelT * 5} 85% ${56 - levelT * 10}%)`);

    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.58, h * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.2 + levelT * 1.6;
    ctx.strokeStyle = `rgba(255, 243, 214, ${0.25 + levelT * 0.4})`;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,133,54,0.85)";
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(-w * 0.88, h * (0.35 + tailSwing * 0.12));
    ctx.lineTo(-w * 0.88, -h * (0.35 - tailSwing * 0.12));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,248,225,0.6)";
    ctx.beginPath();
    ctx.ellipse(w * 0.1, -h * 0.2, w * 0.21, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1b1a1a";
    ctx.beginPath();
    ctx.arc(w * 0.31, -h * 0.08, Math.max(1.2, fish.size * 1.4), 0, Math.PI * 2);
    ctx.fill();

    if (world.degradeLevel === 0) {
      ctx.globalAlpha = 0.17;
      ctx.strokeStyle = "#fff4d1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w * 0.35, -h * 0.05);
      ctx.quadraticCurveTo(0, -h * 0.3, w * 0.3, -h * 0.12);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

  }

  function drawFoods() {
    for (let i = 0; i < foods.length; i += 1) {
      const food = foods[i];
      ctx.fillStyle = "#dbc7a7";
      ctx.beginPath();
      ctx.arc(food.x, food.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = `rgba(255, 220, 140, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRipples() {
    if (world.degradeLevel >= 2) return;
    for (let i = 0; i < ripples.length; i += 1) {
      const r = ripples[i];
      const t = r.life / r.maxLife;
      ctx.strokeStyle = `rgba(210, 245, 255, ${0.34 * t})`;
      ctx.lineWidth = r.width * (0.8 + t * 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();

      if (world.degradeLevel === 0) {
        ctx.strokeStyle = `rgba(170, 228, 247, ${0.18 * t})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawFrontLight(t) {
    if (world.degradeLevel >= 1) return;
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 4; i += 1) {
      const y = (i + 1) * (world.height / 5);
      const x = (Math.sin(t * 0.00024 + i * 1.8) * 0.5 + 0.5) * world.width;
      ctx.fillStyle = "rgba(207, 244, 255, 0.7)";
      ctx.fillRect(x - 150, y - 5, 300, 10);
    }
    ctx.globalAlpha = 1;
  }

  function updateFps(dt) {
    const fps = 1 / Math.max(0.0001, dt);
    world.fpsSamples.push(fps);
    if (world.fpsSamples.length > 40) world.fpsSamples.shift();
    const avg = world.fpsSamples.reduce((a, b) => a + b, 0) / world.fpsSamples.length;

    if (avg < PondConfig.fpsDegradeThreshold && world.degradeLevel < 2) {
      world.degradeLevel += 1;
    } else if (avg > PondConfig.fpsRecoverThreshold && world.degradeLevel > 0) {
      world.degradeLevel -= 1;
    }

    metricsEl.textContent = `FPS: ${avg.toFixed(0)} | Fish: ${fishes.length} | Food: ${foods.length}`;
  }

  function bindControlPanel() {
    if (!controlPanelEl) return;
    const panelStateKey = "goldfishies.panel.collapsed";
    const safeStorage = {
      get() {
        try {
          return window.localStorage.getItem(panelStateKey);
        } catch (_) {
          return panelStateMemory.collapsed;
        }
      },
      set(v) {
        panelStateMemory.collapsed = v;
        try {
          window.localStorage.setItem(panelStateKey, v);
        } catch (_) {
          // no-op: localStorage may be blocked for file:// contexts
        }
      },
    };

    const controls = [
      { id: "fishCount", key: "fishCount", digits: 0, onChange: syncFishCount },
      { id: "minSpeed", key: "minSpeed", digits: 0, onChange: () => {
        PondConfig.maxSpeed = Math.max(PondConfig.maxSpeed, PondConfig.minSpeed + 1);
        updateControlValue("maxSpeed", PondConfig.maxSpeed, 0);
      } },
      { id: "maxSpeed", key: "maxSpeed", digits: 0, onChange: () => {
        PondConfig.minSpeed = Math.min(PondConfig.minSpeed, PondConfig.maxSpeed - 1);
        updateControlValue("minSpeed", PondConfig.minSpeed, 0);
      } },
      { id: "chaseBoost", key: "chaseBoost", digits: 0 },
      { id: "senseRadius", key: "senseRadius", digits: 0 },
      { id: "boundaryPadding", key: "boundaryPadding", digits: 0 },
      { id: "separationWeight", key: "separationWeight", digits: 2 },
      { id: "alignmentWeight", key: "alignmentWeight", digits: 2 },
      { id: "cohesionWeight", key: "cohesionWeight", digits: 2 },
      { id: "rippleLife", key: "rippleLife", digits: 2 },
      { id: "lilyAttractWeight", key: "lilyAttractWeight", digits: 2 },
      { id: "lilyHomeRadiusFactor", key: "lilyHomeRadiusFactor", digits: 1 },
      { id: "lilyReturnWeight", key: "lilyReturnWeight", digits: 2 },
    ];

    function formatValue(v, digits) {
      return digits > 0 ? Number(v).toFixed(digits) : `${Math.round(v)}`;
    }

    function updateControlValue(id, value, digits) {
      const slider = document.getElementById(id);
      const valueEl = document.getElementById(`${id}Value`);
      if (slider) slider.value = `${value}`;
      if (valueEl) valueEl.textContent = formatValue(value, digits);
    }

    for (let i = 0; i < controls.length; i += 1) {
      const cfg = controls[i];
      const slider = document.getElementById(cfg.id);
      const valueEl = document.getElementById(`${cfg.id}Value`);
      if (!slider || !valueEl) continue;

      slider.value = `${PondConfig[cfg.key]}`;
      valueEl.textContent = formatValue(PondConfig[cfg.key], cfg.digits);

      slider.addEventListener("input", () => {
        const v = Number(slider.value);
        PondConfig[cfg.key] = v;
        valueEl.textContent = formatValue(v, cfg.digits);
        if (cfg.onChange) cfg.onChange();
      });
    }

    if (togglePanelBtnEl) {
      const applyCollapsed = (collapsed) => {
        controlPanelEl.classList.toggle("collapsed", collapsed);
        togglePanelBtnEl.textContent = collapsed ? "展开" : "收起";
      };

      const saved = safeStorage.get();
      applyCollapsed(saved === "1");

      togglePanelBtnEl.addEventListener("click", () => {
        const collapsed = !controlPanelEl.classList.contains("collapsed");
        applyCollapsed(collapsed);
        safeStorage.set(collapsed ? "1" : "0");
      });
    }
  }

  function onFeed(clientX, clientY) {
    const now = performance.now();
    if (now - world.lastFeedTs < PondConfig.feedCooldownMs) return;
    world.lastFeedTs = now;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const pellets = world.degradeLevel >= 1 ? 1 : 2;
    for (let i = 0; i < pellets; i += 1) {
      spawnFood(x + rand(-8, 8), y + rand(-8, 8));
    }
    spawnParticles(x, y, 4);
    spawnRipple(x, y, 0.9);
  }

  function bindInput() {
    const handlePointer = (e) => {
      if (e.cancelable) e.preventDefault();
      onFeed(e.clientX, e.clientY);
    };
    canvas.addEventListener("pointerdown", handlePointer, { passive: false });
    canvas.addEventListener("pointermove", (e) => {
      if (e.buttons === 1) handlePointer(e);
    }, { passive: false });

    if (controlPanelEl) {
      controlPanelEl.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
      });
      controlPanelEl.addEventListener("pointermove", (e) => {
        e.stopPropagation();
      });
    }
  }

  function init() {
    resize();
    fishes.length = 0;
    syncFishCount();
    bindControlPanel();
    bindInput();
    let last = performance.now();

    const frame = (ts) => {
      const rawDt = (ts - last) / 1000;
      last = ts;
      const dt = Math.min(rawDt, 0.033);
      world.time += dt;

      updateFps(dt);
      updateFoods(dt);
      ensureTargets();
      const lilyLoads = new Map();
      for (let i = 0; i < lilies.length; i += 1) lilyLoads.set(lilies[i].id, 0);
      for (let i = 0; i < fishes.length; i += 1) updateFish(fishes[i], dt, lilyLoads);
      updateParticles(dt);
      updateRipples(dt);

      drawBackground(ts);
      drawRipples();
      drawFoods();
      for (let i = 0; i < fishes.length; i += 1) drawFishBody(fishes[i]);
      drawLilies(ts);
      drawParticles();
      drawFrontLight(ts);

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  init();
})();
