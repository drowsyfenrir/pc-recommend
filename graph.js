(function () {
  const NODE_W = 600;
  const NODE_H = 276;
  const LABEL_W = 180;
  const LABEL_H = 80;
  const PERSON_GAP_X = 20;
  const PERSON_GAP_Y = 40;
  const CELL_W = NODE_W + PERSON_GAP_X;
  const CELL_H = NODE_H + PERSON_GAP_Y;
  const GROUP_PAD_X = 24;
  const GROUP_TOP = 50;
  const GROUP_BOTTOM = 54;
  const ARROW_LENGTH = 16;
  const ARROW_HALF = 8;
  const ARROW_LINE_INSET = 8;
  const GROUP_ENDPOINT_OUTSET = 0;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function groupName(data, id) {
    return data.groups.find(group => group.id === id)?.name || '미지정';
  }

  function normalizeGroup(group) {
    group.cols = Math.max(1, Number(group.cols) || 3);
    group.rows = Math.max(1, Number(group.rows) || 1);
    group.x = Number(group.x) || 0;
    group.y = Number(group.y) || 0;
  }

  function orderedPeople(data, groupId) {
    return data.people
      .filter(person => person.groupId === groupId)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || data.people.indexOf(a) - data.people.indexOf(b));
  }

  function childGroups(data, groupId) {
    return data.groups
      .filter(group => group.parentGroupId === groupId)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || data.groups.indexOf(a) - data.groups.indexOf(b));
  }

  function wrappedLineCount(value, charsPerLine = 44) {
    const text = String(value || '').trim();
    if (!text) return 0;
    return text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / charsPerLine)), 0);
  }

  function personNodeHeight(person) {
    const nameLines = Math.max(1, wrappedLineCount(person.name, 38));
    const priceLines = Math.max(person.traits ? 1 : 0, wrappedLineCount(person.traits, 48));
    const descriptionLines = wrappedLineCount(person.description, 50);
    const estimated = 20 + 150 + 10 + nameLines * 28 + priceLines * 22 + (descriptionLines ? 8 + descriptionLines * 20 : 0);
    return Math.max(NODE_H, estimated);
  }

  function groupDepth(data, group) {
    let depth = 0;
    let parentId = group.parentGroupId;
    const seen = new Set([group.id]);
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = data.groups.find(item => item.id === parentId);
      if (!parent) break;
      depth += 1;
      parentId = parent.parentGroupId;
    }
    return depth;
  }

  function applyAutoLayout(data) {
    data.labels ||= [];
    data.groups.forEach(group => {
      normalizeGroup(group);
      if (group.parentGroupId === group.id || !data.groups.some(parent => parent.id === group.parentGroupId)) group.parentGroupId = '';
    });
    data.groups
      .filter(group => !group.parentGroupId)
      .forEach(group => layoutGroup(data, group, group.x, group.y));
    data.people
      .filter(person => !person.groupId)
      .forEach(person => {
        person.x = Number(person.x) || 120;
        person.y = Number(person.y) || 120;
      });
  }

  function layoutGroup(data, group, x, y) {
    group.x = x;
    group.y = y;
    group.peopleOrder = Number(group.peopleOrder) || 0;

    const members = orderedPeople(data, group.id);
    const children = childGroups(data, group.id);

    const elements = [];
    if (members.length > 0) {
      elements.push({ type: 'people', order: group.peopleOrder });
    }
    children.forEach(child => {
      elements.push({ type: 'group', order: Number(child.order) || 0, data: child });
    });

    elements.sort((a, b) => a.order - b.order);

    const hasChildren = children.length > 0;
    const padX = hasChildren ? GROUP_PAD_X * 2 : GROUP_PAD_X;

    let currentY = group.y + GROUP_TOP;
    const baseW = padX * 2 + group.cols * CELL_W - (CELL_W - NODE_W);
    let contentW = baseW;

    elements.forEach(element => {
      if (element.type === 'people') {
        const rowsNeeded = Math.max(group.rows || 1, Math.ceil(members.length / group.cols));
        const rowHeights = Array.from({ length: rowsNeeded }, (_, row) => {
          const rowMembers = members.slice(row * group.cols, row * group.cols + group.cols);
          return Math.max(NODE_H, ...rowMembers.map(personNodeHeight));
        });
        members.forEach((person, index) => {
          person.order = index;
          const col = index % group.cols;
          const row = Math.floor(index / group.cols);
          person.x = group.x + padX + col * CELL_W;
          person.y = currentY + rowHeights.slice(0, row).reduce((sum, height) => sum + height + PERSON_GAP_Y, 0);
        });
        const heightUsed = rowHeights.reduce((sum, height) => sum + height, 0) + PERSON_GAP_Y * Math.max(0, rowsNeeded - 1);
        currentY += heightUsed + 34;
      } else if (element.type === 'group') {
        const child = element.data;
        layoutGroup(data, child, group.x + GROUP_PAD_X, currentY);
        contentW = Math.max(contentW, GROUP_PAD_X * 2 + child.w);
        currentY += child.h + 40;
      }
    });

    group.w = contentW;
    const finalBottomY = currentY - (elements.length > 0 ? (elements[elements.length - 1].type === 'people' ? 34 : 40) : 0);
    group.h = Math.max(GROUP_TOP + GROUP_BOTTOM + (group.rows * CELL_H - (CELL_H - NODE_H)), finalBottomY - group.y + GROUP_BOTTOM);
  }

  function elementBox(data, type, id) {
    applyAutoLayout(data);
    if (type === 'group') {
      const group = data.groups.find(item => item.id === id);
      return group ? { x: group.x, y: group.y, w: group.w, h: group.h } : null;
    }
    if (type === 'person') {
      const person = data.people.find(item => item.id === id);
      return person ? { x: person.x, y: person.y, w: NODE_W, h: personNodeHeight(person) } : null;
    }
    if (type === 'label') {
      const label = data.labels.find(item => item.id === id);
      return label ? { x: label.x, y: label.y, w: Number(label.w) || LABEL_W, h: Number(label.h) || LABEL_H } : null;
    }
    return null;
  }

  function endpoint(data, type, id, position = 'center') {
    const box = elementBox(data, type, id);
    return box ? anchorPoint(box, position) : null;
  }

  function anchorPoint(box, position = 'center') {
    const x = box.x;
    const y = box.y;
    const w = box.w;
    const h = box.h;
    const points = {
      center: { x: x + w / 2, y: y + h / 2 },
      top: { x: x + w / 2, y },
      bottom: { x: x + w / 2, y: y + h },
      left: { x, y: y + h / 2 },
      right: { x: x + w, y: y + h / 2 }
    };
    return points[position] || points.center;
  }

  function rectPoint(container, rect, xRatio, yRatio) {
    const base = container.getBoundingClientRect();
    return {
      x: rect.left - base.left + container.scrollLeft + rect.width * xRatio,
      y: rect.top - base.top + container.scrollTop + rect.height * yRatio
    };
  }

  function domEndpoint(container, data, type, id, position = 'center') {
    const usePureDataModel = 
      type === 'person' || 
      (type !== 'label' && (
        position === 'left' || 
        position === 'right' || 
        position === 'center'
      ));

    if (usePureDataModel) {
      const purePoint = endpoint(data, type, id, position);
      return purePoint ? outsetEndpoint(purePoint, type, position) : null;
    }

    if (type === 'group') {
      const group = data.groups.find(item => item.id === id);
      const bottomSelector = group && !group.parentGroupId && group.descriptionEnabled !== false ? '.group-description' : '';
      return decoratedEndpoint(container, data, type, id, position, '.group-title', bottomSelector);
    }
    if (type === 'label') return decoratedEndpoint(container, data, type, id, position, '.map-label-title', '.map-label-body');
    
    return endpoint(data, type, id, position);
  }

  function snapPoint(point, position = 'center') {
    return point ? { x: point.x, y: point.y } : null;
  }

  function decoratedEndpoint(container, data, type, id, position, titleSelector, bottomSelector) {
    const el = container.querySelector(`[data-type="${type}"][data-id="${CSS.escape(id)}"]`);
    if (!el) return endpoint(data, type, id, position);

    if (type === 'label' && (position === 'left' || position === 'right')) {
      const baseRect = el.getBoundingClientRect();
      const elCenterY = baseRect.top + baseRect.height / 2;
      const rectPointY = elCenterY - container.getBoundingClientRect().top + container.scrollTop;
      const rectPointX = position === 'left'
        ? baseRect.left - container.getBoundingClientRect().left + container.scrollLeft
        : baseRect.right - container.getBoundingClientRect().left + container.scrollLeft;
      return { x: rectPointX, y: rectPointY };
    }

    if (type === 'label' && position === 'bottom') {
      const baseRect = el.getBoundingClientRect();
      return outsetEndpoint(rectPoint(container, baseRect, 0.5, 1), type, position);
    }

    if (position === 'top') {
      const title = titleSelector ? el.querySelector(titleSelector) : el;
      return title ? outsetEndpoint(rectPoint(container, title.getBoundingClientRect(), 0.5, 0), type, position) : endpoint(data, type, id, position);
    }
    if (position === 'bottom') {
      const bottomEl = bottomSelector ? el.querySelector(bottomSelector) : el;
      return bottomEl ? outsetEndpoint(rectPoint(container, bottomEl.getBoundingClientRect(), 0.5, 1), type, position) : endpoint(data, type, id, position);
    }

    const rect = el.getBoundingClientRect();
    const points = {
      center: rectPoint(container, rect, 0.5, 0.5),
      left: rectPoint(container, rect, 0, 0.5),
      right: rectPoint(container, rect, 1, 0.5)
    };
    return outsetEndpoint(points[position] || points.center, type, position);
  }

  function outsetEndpoint(point, type, position) {
    if (type !== 'group') return point;
    const offsets = {
      left: { x: -GROUP_ENDPOINT_OUTSET, y: 0 },
      right: { x: GROUP_ENDPOINT_OUTSET, y: 0 },
      top: { x: 0, y: -GROUP_ENDPOINT_OUTSET },
      bottom: { x: 0, y: GROUP_ENDPOINT_OUTSET }
    };
    const offset = offsets[position];
    return offset ? { x: point.x + offset.x, y: point.y + offset.y } : point;
  }

  function relationPath(a, b, relation) {
    const offsetX = Number(relation.labelOffsetX) || 0;
    const offsetY = Number(relation.labelOffsetY) || 0;
    const baseLabel = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const label = { x: baseLabel.x + offsetX, y: baseLabel.y + offsetY };

    if (!['orthogonal', 'left-orthogonal', 'right-orthogonal'].includes(relation.lineType)) {
      const points = offsetX || offsetY ? [a, label, b] : [a, b];
      return { d: pointsToPath(points), label, points };
    }

    if (relation.lineType === 'left-orthogonal' || relation.lineType === 'right-orthogonal') {
      const points = hybridOrthogonalPoints(a, b, label, relation.lineType);
      return {
        d: pointsToPath(points),
        points,
        label
      };
    }

    const fromPos = relation.fromPosition || 'center';
    const toPos = relation.toPosition || 'center';
    const horizontalMiddle = [fromPos, toPos].some(pos => pos === 'top' || pos === 'bottom')
      || (![fromPos, toPos].some(pos => pos === 'left' || pos === 'right') && Math.abs(b.y - a.y) >= Math.abs(b.x - a.x));

    if (horizontalMiddle) {
      const midY = label.y;
      const points = [a, { x: a.x, y: midY }, { x: label.x, y: midY }, { x: b.x, y: midY }, b];
      return {
        d: pointsToPath(points),
        points,
        label
      };
    }

    const midX = label.x;
    const points = [a, { x: midX, y: a.y }, { x: midX, y: label.y }, { x: midX, y: b.y }, b];
    return {
      d: pointsToPath(points),
      points,
      label
    };
  }

  function hybridOrthogonalPoints(a, b, label, lineType) {
    const start = segmentToLabel(a, label, bendSide(a, label, lineType));
    const end = segmentFromLabel(label, b, bendSide(b, label, lineType));
    const points = [...start, ...end.slice(1)];
    return dedupePoints(points);
  }

  function bendSide(point, label, lineType) {
    const isLeft = point.x < label.x;
    const isRight = point.x > label.x;
    const isAbove = point.y < label.y;
    if (lineType === 'left-orthogonal') {
      if (isLeft) return 'horizontal';
      if (isAbove) return 'vertical';
      return '';
    }
    if (isRight) return 'horizontal';
    if (isAbove) return 'vertical';
    return '';
  }

  function segmentToLabel(point, label, bendAxis) {
    if (!bendAxis) return orthogonalFallback(point, label);
    const corner = bendAxis === 'horizontal'
      ? { x: label.x, y: point.y }
      : { x: point.x, y: label.y };
    return [point, corner, label];
  }

  function segmentFromLabel(label, point, bendAxis) {
    if (!bendAxis) return orthogonalFallback(label, point);
    const corner = bendAxis === 'horizontal'
      ? { x: point.x, y: label.y }
      : { x: label.x, y: point.y };
    return [label, corner, point];
  }

  function orthogonalFallback(from, to) {
    if (Math.abs(from.x - to.x) <= 0.5 || Math.abs(from.y - to.y) <= 0.5) return [from, to];
    return [from, { x: to.x, y: from.y }, to];
  }

  function dedupePoints(points) {
    return points.filter((point, index) => {
      const prev = points[index - 1];
      return !prev || Math.abs(prev.x - point.x) > 0.5 || Math.abs(prev.y - point.y) > 0.5;
    });
  }

  function pointsToPath(points) {
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  }

  function insetPoint(tip, tail, distance) {
    const dx = tail.x - tip.x;
    const dy = tail.y - tip.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: tip.x + dx / length * distance,
      y: tip.y + dy / length * distance
    };
  }

  function linePointsForArrows(points, relation, scale) {
    const nextPoints = points.map(point => ({ ...point }));
    const inset = ARROW_LINE_INSET * scale;
    if (relation.direction === 'both' && nextPoints.length > 1) {
      nextPoints[0] = insetPoint(nextPoints[0], tangentPoint(nextPoints, 0, 1), inset);
    }
    if (relation.direction !== 'none' && nextPoints.length > 1) {
      const lastIndex = nextPoints.length - 1;
      nextPoints[lastIndex] = insetPoint(nextPoints[lastIndex], tangentPoint(nextPoints, lastIndex, -1), inset);
    }
    return nextPoints;
  }

  function arrowPoints(tip, tail, scale = 1) {
    const dx = tip.x - tail.x;
    const dy = tip.y - tail.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const base = { x: tip.x - ux * ARROW_LENGTH * scale, y: tip.y - uy * ARROW_LENGTH * scale };
    const px = -uy * ARROW_HALF * scale;
    const py = ux * ARROW_HALF * scale;
    return `${tip.x},${tip.y} ${base.x + px},${base.y + py} ${base.x - px},${base.y - py}`;
  }

  function tangentPoint(points, index, step) {
    const tip = points[index];
    for (let i = index + step; i >= 0 && i < points.length; i += step) {
      if (Math.hypot(tip.x - points[i].x, tip.y - points[i].y) > 0.5) return points[i];
    }
    return tip;
  }

  function appendArrow(svg, tip, tail, scale = 1, color = '#061633') {
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow.setAttribute('points', arrowPoints(tip, tail, scale));
    arrow.setAttribute('fill', color);
    svg.append(arrow);
    return arrow;
  }

  function arrowTailForAnchor(tip, fallbackTail, position) {
    const tails = {
      left: { x: tip.x - 1, y: tip.y },
      right: { x: tip.x + 1, y: tip.y },
      top: { x: tip.x, y: tip.y - 1 },
      bottom: { x: tip.x, y: tip.y + 1 }
    };
    return tails[position] || fallbackTail;
  }

  function appendEndpointDot(svg, point, enabled) {
    if (!enabled) return;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', point.x);
    dot.setAttribute('cy', point.y);
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', '#ff1f1f');
    dot.setAttribute('stroke', '#fff');
    dot.setAttribute('stroke-width', '1.5');
    svg.append(dot);
  }

  function renderGraph(container, data, options = {}) {
    applyAutoLayout(data);
    container.innerHTML = '';
    const isEditor = container.classList.contains('editor-canvas');
    const rightOffset = isEditor ? 560 : 200;
    const canvasWidth = Math.max(1200, ...data.groups.map(g => g.x + g.w + rightOffset), ...data.people.map(p => p.x + NODE_W + rightOffset), ...data.labels.map(l => l.x + (Number(l.w) || LABEL_W) + rightOffset));
    const canvasHeight = Math.max(760, ...data.groups.map(g => g.y + g.h + 200), ...data.people.map(p => p.y + personNodeHeight(p) + 200), ...data.labels.map(l => l.y + (Number(l.h) || LABEL_H) + 200));
    container.style.width = `${canvasWidth}px`;
    container.style.height = `${canvasHeight}px`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('graph-svg');
    svg.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
    svg.style.width = `${canvasWidth}px`;
    svg.style.height = `${canvasHeight}px`;

    const endpointSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    endpointSvg.classList.add('graph-svg', 'endpoint-svg');
    endpointSvg.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
    endpointSvg.style.width = `${canvasWidth}px`;
    endpointSvg.style.height = `${canvasHeight}px`;

    const showEndpointDots = options.showEndpointDots === true;

    data.groups.slice().sort((a, b) => groupDepth(data, a) - groupDepth(data, b)).forEach(group => {
      const el = document.createElement('section');
      el.className = 'group-box';
      el.classList.toggle('is-child-group', Boolean(group.parentGroupId));
      el.dataset.type = 'group';
      el.dataset.id = group.id;
      el.style.setProperty('--group-color', normalizeHex(group.color, '#d7e8ff'));
      el.style.setProperty('--group-border-color', normalizeHex(group.borderColor, '#061633'));
      el.classList.toggle('has-no-border', group.borderEnabled === false);
      Object.assign(el.style, { left: `${group.x}px`, top: `${group.y}px`, width: `${group.w}px`, height: `${group.h}px` });
      const showDescription = !group.parentGroupId && group.descriptionEnabled !== false;
      el.innerHTML = `<strong class="group-title">${escapeHtml(group.name)}</strong>${showDescription ? `<p class="group-description">${escapeHtml(group.description || '')}</p>` : ''}`;
      container.append(el);
      options.onElement?.(el, group, 'group');
    });

    data.people.forEach(person => {
      const el = document.createElement('article');
      el.className = 'person-card';
      el.dataset.type = 'person';
      el.dataset.id = person.id;
      Object.assign(el.style, { left: `${person.x}px`, top: `${person.y}px` });
      const imageStyle = person.image ? `style="background-image:url('${escapeAttr(person.image)}')"` : '';
      el.innerHTML = `<div class="avatar" ${imageStyle}></div><strong class="person-name">${escapeHtml(person.name)}</strong><span class="person-group person-price">${escapeHtml(person.traits || '')}</span><p class="person-description">${escapeHtml(person.description || '')}</p>`;
      container.append(el);
      options.onElement?.(el, person, 'person');
    });

    data.labels.forEach(label => {
      const el = document.createElement('article');
      el.className = 'map-label';
      el.dataset.type = 'label';
      el.dataset.id = label.id;
      Object.assign(el.style, {
        left: `${label.x}px`,
        top: `${label.y}px`,
        width: `${Number(label.w) || LABEL_W}px`,
        minHeight: `${Number(label.h) || LABEL_H}px`
      });
      el.innerHTML = `<strong class="map-label-title">${escapeHtml(label.name || label.text || '라벨')}</strong><p class="map-label-body">${escapeHtml(label.description || label.body || '')}</p>`;
      container.append(el);
      options.onElement?.(el, label, 'label');
    });

    data.relations.forEach(relation => {
      const fromPosition = relation.fromPosition || 'center';
      const toPosition = relation.toPosition || 'center';
      const a = snapPoint(domEndpoint(container, data, relation.fromType, relation.from, fromPosition), fromPosition);
      const b = snapPoint(domEndpoint(container, data, relation.toType, relation.to, toPosition), toPosition);
      if (!a || !b) return;
      const relationLine = relationPath(a, b, relation);
      const arrowScale = relation.fromType === 'person' && relation.toType === 'person' ? 0.5 : 1;
      const linePoints = linePointsForArrows(relationLine.points, relation, arrowScale);
      const lineColor = normalizeHex(relation.lineColor, '#061633');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('relation-line');
      path.dataset.type = 'relation';
      path.dataset.id = relation.id;
      path.setAttribute('d', pointsToPath(linePoints));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', lineColor);
      path.setAttribute('stroke-width', '3');
      svg.append(path);
      if (relation.direction === 'both') {
        const startTip = relationLine.points[0];
        const isOrthogonal = relation.lineType !== 'straight';
        const tail = isOrthogonal 
          ? arrowTailForAnchor(startTip, tangentPoint(relationLine.points, 0, 1), fromPosition)
          : tangentPoint(relationLine.points, 0, 1);
        const arrow = appendArrow(svg, startTip, tail, arrowScale, lineColor);
        arrow.classList.add('relation-arrow');
        arrow.dataset.type = 'relation';
        arrow.dataset.id = relation.id;
      }
      if (relation.direction !== 'none') {
        const endTip = relationLine.points.at(-1);
        const isOrthogonal = relation.lineType !== 'straight';
        const tail = isOrthogonal
          ? arrowTailForAnchor(endTip, tangentPoint(relationLine.points, relationLine.points.length - 1, -1), toPosition)
          : tangentPoint(relationLine.points, relationLine.points.length - 1, -1);
        const arrow = appendArrow(svg, endTip, tail, arrowScale, lineColor);
        arrow.classList.add('relation-arrow');
        arrow.dataset.type = 'relation';
        arrow.dataset.id = relation.id;
      }
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.classList.add('relation-line-hit');
      hitPath.dataset.type = 'relation';
      hitPath.dataset.id = relation.id;
      hitPath.setAttribute('d', pointsToPath(linePoints));
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', '18');
      svg.append(hitPath);
      options.onElement?.(hitPath, relation, 'relation');
      appendEndpointDot(endpointSvg, relationLine.points[0], showEndpointDots);
      appendEndpointDot(endpointSvg, relationLine.points.at(-1), showEndpointDots);

      if (relation.labelVisible !== false) {
        const label = document.createElement('div');
        label.className = 'relation-label';
        label.dataset.type = 'relation';
        label.dataset.id = relation.id;
        const boxW = Number(relation.boxW) || 180;
        label.style.left = `${relationLine.label.x}px`;
        label.style.top = `${relationLine.label.y}px`;
        label.style.width = `${boxW}px`;
        if (Number(relation.boxH) > 0) label.style.minHeight = `${Number(relation.boxH)}px`;
        label.innerHTML = `${escapeHtml(relation.label || '관계')}<span class="relation-desc">${escapeHtml(relation.description || '')}</span>`;
        container.append(label);
        options.onElement?.(label, relation, 'relation');
      } else {
        const control = document.createElement('div');
        control.className = 'relation-hidden-control';
        control.dataset.type = 'relation';
        control.dataset.id = relation.id;
        control.style.left = `${relationLine.label.x}px`;
        control.style.top = `${relationLine.label.y}px`;
        container.append(control);
      }
    });

    container.append(svg);
    container.append(endpointSvg);

    return container;
  }

  async function bootViewer({ dataUrl }) {
    const url = `${dataUrl}${dataUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
    const data = await fetch(url, { cache: 'no-store' }).then(res => res.json());
    const graph = document.getElementById('graph');
    const search = document.getElementById('searchInput');
    const filter = document.getElementById('groupFilter');
    if (filter) {
      data.groups.forEach(group => filter.add(new Option(group.name, group.id)));
    }

    function draw() {
      renderGraph(graph, data, { showEndpointDots: true });
      const q = search ? search.value.trim().toLowerCase() : '';
      const selectedGroup = filter ? filter.value : 'all';
      graph.querySelectorAll('.person-card').forEach(card => {
        const person = data.people.find(item => item.id === card.dataset.id);
        const haystack = [person.name, person.traits, person.description, groupName(data, person.groupId)].join(' ').toLowerCase();
        const visible = (!q || haystack.includes(q)) && (selectedGroup === 'all' || person.groupId === selectedGroup);
        card.classList.toggle('is-dim', !visible);
      });
    }
    if (search) search.addEventListener('input', draw);
    if (filter) filter.addEventListener('change', draw);
    draw();
    return { data, graph };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function escapeAttr(value) {
    return String(value ?? '').replace(/["'\\]/g, '');
  }

  function normalizeHex(value, fallback = '#ffffff') {
    const text = String(value || '').trim();
    const withHash = text.startsWith('#') ? text : `#${text}`;
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(withHash) ? withHash : fallback;
  }

  window.RelationshipGraph = { bootViewer, renderGraph, clone, endpoint, applyAutoLayout, orderedPeople };
})();
