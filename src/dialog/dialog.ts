/* global Office */

// API 配置
    const API_BASE = 'https://localhost:3001/api';
    // 新增：图片基础路径
    const IMAGE_BASE = 'https://localhost:3001/public/images/';
    const IMAGE_CACHE_BUSTER = Date.now().toString(36);

    // 简单缓存
    const cache = {
        categories: null,
        projects: {}, // categoryId -> projects
        details: {}, // projectId -> details
        annotations: {}, // projectId -> annotations
        config: {} // projectId -> config
    };

    // 数据存储
    let currentCategoryId = null;
    let currentCategoryName = null;
    let currentProjectId = null;
    let currentProjectName = null;
    let selectedDetails = new Map(); // 改用 Map，key=id, value={name, imageUrl, layer}
    let selectedAnnotations = new Map(); // 改用 Map，key=id, value={name, posX, posY, imageUrl}

    // Canvas 相关变量
    let canvas = null;
    let ctx = null;
    let bufferCanvas = null;
    let bufferCtx = null;
    let components = {}; // 存储所有组件数据 {id: {name, img, visible, layer, imageUrl}}
    let analysisCanvases = {};
    let analysisCtxs = {};
    let currentHighlightedComponentId = null;
    let outlineCache = {};
    let outlineEnabled = true;
    let outlineMode = 'hover';
    let currentBaseImageUrl = '';
    let mouseEventsBound = false;

    // 防抖：减少频繁的 renderCanvas 调用
    let renderTimer = null;
    function scheduleRender(highlightId) {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
            renderCanvas(highlightId);
            renderTimer = null;
        }, 16); // 约60fps
    }

    function resizeImageArea() {
        const imageContainer = document.getElementById('imageContainer');
        const rightPanel = imageContainer ? imageContainer.parentElement : null;
        if (!imageContainer || !rightPanel) return;

        const titleEl = rightPanel.querySelector('.panel-title');
        const actionsEl = rightPanel.querySelector('.action-buttons');
        const titleHeight = titleEl ? titleEl.offsetHeight : 0;
        const actionsHeight = actionsEl ? actionsEl.offsetHeight : 0;

        const availableHeight = Math.max(200, rightPanel.clientHeight - titleHeight - actionsHeight - 12);
        const availableWidth = Math.max(200, rightPanel.clientWidth);
        const size = Math.min(availableWidth, availableHeight);

        imageContainer.style.width = `${size}px`;
        imageContainer.style.height = `${size}px`;

        if (canvas && bufferCanvas) {
            canvas.width = size;
            canvas.height = size;
            bufferCanvas.width = size;
            bufferCanvas.height = size;
        }
        if (Object.keys(components).length > 0) {
            renderCanvas(currentHighlightedComponentId);
        }
    }

    // 初始化
    Office.onReady(() => {
        console.log("Dialog 已就绪");

        // 初始化 Canvas
        canvas = document.getElementById('mainCanvas');
        ctx = canvas.getContext('2d');
        bufferCanvas = document.createElement('canvas');
        bufferCtx = bufferCanvas.getContext('2d');

        // 设置初始 Canvas 尺寸
        resizeImageArea();
        window.addEventListener('resize', resizeImageArea);

        // 显示占位符
        showCanvasPlaceholder('← 选择项目后显示图片');

        loadCategories();
    });

    // 1. 加载产品类型（带缓存）
    async function loadCategories() {
        // 检查缓存
        if (cache.categories) {
            displayCategories(cache.categories);
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/categories`);
            const result = await response.json();

            if (result.success) {
                cache.categories = result.data; // 缓存
                displayCategories(result.data);
            } else {
                console.error('加载产品类型失败:', result.error || result.message);
                showError('加载产品类型失败: ' + (result.error || result.message || '未知错误'));
            }
        } catch (error) {
            console.error('加载产品类型失败:', error);
            showError('无法连接到数据库服务器: ' + error.message);
        }
    }

    // 2. 显示产品类型列表
    function displayCategories(categories) {
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = '';

        if (categories.length === 0) {
            categoryList.innerHTML = '<div class="placeholder">暂无产品类型</div>';
            return;
        }

        categories.forEach(category => {
            const item = document.createElement('div');
            item.className = 'listbox-item';
            item.textContent = category.name;
            item.dataset.id = category.id;
            item.onclick = () => selectCategory(category.id, category.name);
            categoryList.appendChild(item);
        });

        // 不再自动选中第一个，让用户手动选择
    }

    // 3. 选择产品类型 → 加载产品型号
    async function selectCategory(categoryId, categoryName) {
        currentCategoryId = categoryId;
        currentCategoryName = categoryName;
        currentProjectId = null;
        currentProjectName = null;
        selectedDetails.clear();
        selectedAnnotations.clear();

        // 更新选中状态
        document.querySelectorAll('#categoryList .listbox-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.id == categoryId);
        });

        // 加载产品型号列表（带缓存）
        const projectList = document.getElementById('projectList');
        projectList.innerHTML = '<div class="loading">加载中...</div>';

        try {
            // 检查缓存
            let result = cache.projects[categoryId];
            if (!result) {
                const response = await fetch(`${API_BASE}/projects/${categoryId}`);
                const data = await response.json();
                if (data.success) {
                    result = data;
                    cache.projects[categoryId] = data; // 缓存
                }
            }

            if (result && result.success) {
                displayProjects(result.data);
            } else {
                console.error('加载产品型号失败:', result?.error || result?.message);
                projectList.innerHTML = `<div class="error">加载产品型号失败: ${result?.error || result?.message || '未知错误'}</div>`;
            }
        } catch (error) {
            console.error('加载产品型号失败:', error);
            projectList.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
        }

        clearRightPanels();
    }

    // 4. 显示产品型号列表
    function displayProjects(projects) {
        const projectList = document.getElementById('projectList');
        projectList.innerHTML = '';
        
        if (projects.length === 0) {
            projectList.innerHTML = '<div class="placeholder">该类型下暂无产品</div>';
            return;
        }
        
        projects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'listbox-item';
            item.textContent = project.name;
            item.dataset.id = project.id;
            item.onclick = () => selectProject(project.id, project.name, project.image_url);
            projectList.appendChild(item);
        });
    }

    // 5. 选择产品型号 → 加载组件详情
    async function selectProject(projectId, projectName, imageUrl) {
        if (!currentCategoryId) return;

        currentProjectId = projectId;
        currentProjectName = projectName;
        selectedDetails.clear();
        selectedAnnotations.clear();

        // 更新选中状态
        document.querySelectorAll('#projectList .listbox-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.id == projectId);
        });

        // 显示加载状态
        document.getElementById('detailList').innerHTML = '<div class="loading">加载中...</div>';
        document.getElementById('annotationList').innerHTML = '<div class="loading">加载中...</div>';
        showCanvasPlaceholder('← 选择产品后显示图片');
        Object.keys(components).forEach(id => removeComponentFromCanvas(id));
        selectedDetails.clear();
        selectedAnnotations.clear();
        renderCanvas(currentHighlightedComponentId);

        try {
            // 并行加载详细信息和标注
            const [detailsRes, annotationsRes, configRes] = await Promise.all([
                fetch(`${API_BASE}/details/${projectId}`),
                fetch(`${API_BASE}/annotations/${projectId}`),
                fetch(`${API_BASE}/config/${projectId}`)
            ]);

            const detailsResult = await detailsRes.json();
            const annotationsResult = await annotationsRes.json();
            const configResult = await configRes.json();

            if (detailsResult.success) {
                displayDetails(detailsResult.data);
            } else {
                console.error('Details 加载失败:', detailsResult);
                document.getElementById('detailList').innerHTML = '<div class="error">加载组件失败</div>';
            }

            if (annotationsResult.success) {
                displayAnnotations(annotationsResult.data);
            } else {
                console.error('Annotations 加载失败:', annotationsResult);
                document.getElementById('annotationList').innerHTML = '<div class="error">加载配件失败</div>';
            }

            // 尝试从配置中获取图片
            if (configResult.success && configResult.data && configResult.data.length > 0) {
                // 查找有component_pic的记录
                const componentsWithPic = configResult.data.filter(item => item.component_pic && item.component_pic.trim() !== '');

                if (componentsWithPic.length > 0) {
                    // 优先使用component_sn=1的组件图片
                    const mainComponent = componentsWithPic.find(comp => comp.component_sn === 1) || componentsWithPic[0];
                    const realImageUrl = getImageUrl(mainComponent.component_pic);
                    if (realImageUrl) {
                        displayImage(realImageUrl);
                    } else {
                        displayPlaceholderImage(projectName);
                    }
                } else {
                    displayPlaceholderImage(projectName);
                }
            } else {
                displayPlaceholderImage(projectName);
            }

        } catch (error) {
            console.error('加载项目详情失败:', error);
            document.getElementById('detailList').innerHTML = '<div class="error">加载失败</div>';
            document.getElementById('annotationList').innerHTML = '<div class="error">加载失败</div>';
            displayPlaceholderImage(projectName);
        }
    }

    // 新增：图片路径处理函数
    function getImageUrl(componentPic) {
        if (!componentPic || componentPic.trim() === '') {
            return null;
        }
        
        let fileName = componentPic.trim();
        
        // 如果没有扩展名，添加.png
        if (!fileName.includes('.')) {
            fileName = fileName + '.png';
        }
        
        // 编码中文文件名
        const encodedFileName = encodeURIComponent(fileName);
        const url = new URL(IMAGE_BASE + encodedFileName, window.location.origin);
        url.searchParams.set('v', IMAGE_CACHE_BUSTER);
        return url.toString();
    }

    // 统一处理后端返回的 image_url（协议、中文编码）
    function normalizeImageUrl(rawUrl) {
        if (!rawUrl) return null;
        try {
            const url = new URL(rawUrl, window.location.origin);
            // 强制与当前页面一致的协议（https）
            url.protocol = window.location.protocol;
            // 仅编码路径中的文件名部分
            const parts = url.pathname.split("/").map((part, idx) => {
                if (idx === 0) return part;
                try {
                    return encodeURIComponent(decodeURIComponent(part));
                } catch {
                    return encodeURIComponent(part);
                }
            });
            url.pathname = parts.join("/");
            url.searchParams.set('v', IMAGE_CACHE_BUSTER);
            return url.toString();
        } catch (e) {
            return getImageUrl(rawUrl);
        }
    }

// 6. 显示组件详情（多选，必选项自动选中）
function displayDetails(details) {
    const detailList = document.getElementById('detailList');
    detailList.innerHTML = '';

    if (details.length === 0) {
        detailList.innerHTML = '<div class="placeholder">暂无组件信息</div>';
        return;
    }

    details.forEach((detail, index) => {
        const item = document.createElement('div');
        item.className = 'listbox-item multi-select';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `detail-${index}`;
        checkbox.dataset.id = detail.id;

        // 获取图片URL
        let imageUrl = null;
        if (detail.image_url) {
            imageUrl = normalizeImageUrl(detail.image_url);
        } else if (detail.component_pic) {
            imageUrl = getImageUrl(detail.component_pic);
        }

        // 必选项自动选中并禁用
        if (detail.is_required === 1) {
            checkbox.checked = true;
            checkbox.disabled = true;
            selectedDetails.set(detail.id, {
                name: detail.name,
                imageUrl: imageUrl,
                layer: detail.component_sn || index
            });
            // 添加到 Canvas
            addComponentToCanvas(detail.id, detail.name, imageUrl, detail.component_sn || index);
        }

        checkbox.onchange = () => toggleDetail(detail.id, detail.name, imageUrl, detail.component_sn || index, checkbox.checked);

        const label = document.createElement('label');
        label.htmlFor = `detail-${index}`;
        label.textContent = detail.name + (detail.is_required === 1 ? ' [必选]' : '');
        label.style.cursor = 'pointer';
        label.style.flex = '1';

        if (detail.is_required === 1) {
            label.style.fontWeight = 'bold';
            label.style.color = '#0078d4';
        }

        // 单击列表项：仅切换勾选，保持叠加显示
        item.onclick = (e) => {
            if (e.target && e.target.type === 'checkbox') return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        };

        item.appendChild(checkbox);
        item.appendChild(label);
        detailList.appendChild(item);
    });
}

// 7. 显示标注选项（多选）
function displayAnnotations(annotations) {
    const annotationList = document.getElementById('annotationList');
    annotationList.innerHTML = '';

    if (annotations.length === 0) {
        annotationList.innerHTML = '<div class="placeholder">暂无可选配件</div>';
        return;
    }

    const normalized = normalizeAnnotations(annotations);

    if (normalized.length === 0) {
        annotationList.innerHTML = '<div class="placeholder">暂无可选配件</div>';
        return;
    }

    normalized.forEach((annotation, index) => {
        const item = document.createElement('div');
        item.className = 'listbox-item multi-select';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `anno-${index}`;
        checkbox.dataset.key = annotation.key;

        // 获取图片URL
        let imageUrl = null;
        if (annotation.image_url) {
            imageUrl = normalizeImageUrl(annotation.image_url);
        } else if (annotation.component_pic) {
            imageUrl = getImageUrl(annotation.component_pic);
        }

        checkbox.onchange = () => toggleAnnotation(
            annotation.key,
            annotation.name,
            annotation.position_x,
            annotation.position_y,
            imageUrl,
            checkbox.checked
        );

        const label = document.createElement('label');
        label.htmlFor = `anno-${index}`;
        label.textContent = annotation.name;
        label.style.cursor = 'pointer';
        label.style.flex = '1';

        // 单击空白处切换勾选，保持叠加显示
        item.onclick = (e) => {
            if (e.target && e.target.type === 'checkbox') return;
            checkbox.checked = !checkbox.checked;
            toggleAnnotation(
                annotation.key,
                annotation.name,
                annotation.position_x,
                annotation.position_y,
                imageUrl,
                checkbox.checked
            );
        };

        item.appendChild(checkbox);
        item.appendChild(label);
        annotationList.appendChild(item);
    });
}

// 合并重复的标注项（按名称），优先保留有图片/坐标的记录
function normalizeAnnotations(annotations) {
    const map = new Map();
    annotations.forEach((anno) => {
        const key = (anno.name || '').trim() || `__id_${anno.id}`;
        const existing = map.get(key);
        if (!existing) {
            map.set(key, { ...anno, key });
            return;
        }

        const existingHasImage = !!(existing.image_url || existing.component_pic);
        const candidateHasImage = !!(anno.image_url || anno.component_pic);
        if (!existingHasImage && candidateHasImage) {
            existing.image_url = anno.image_url;
            existing.component_pic = anno.component_pic;
            existing.id = anno.id;
        }

        if ((existing.position_x === null || existing.position_x === undefined || existing.position_x === '') &&
            (anno.position_x !== null && anno.position_x !== undefined && anno.position_x !== '')) {
            existing.position_x = anno.position_x;
        }

        if ((existing.position_y === null || existing.position_y === undefined || existing.position_y === '') &&
            (anno.position_y !== null && anno.position_y !== undefined && anno.position_y !== '')) {
            existing.position_y = anno.position_y;
        }
    });
    return Array.from(map.values());
}

    // 8. 切换组件选择
    function toggleDetail(detailId, detailName, imageUrl, layer, isChecked) {
        if (isChecked) {
            selectedDetails.set(detailId, {
                name: detailName,
                imageUrl: imageUrl,
                layer: layer
            });
            // 添加组件到 Canvas
            addComponentToCanvas(detailId, detailName, imageUrl, layer);
        } else {
            selectedDetails.delete(detailId);
            // 从 Canvas 移除组件
            removeComponentFromCanvas(detailId);
        }

        // 防抖渲染
        scheduleRender(currentHighlightedComponentId);
    }

    // 9. Canvas 相关函数 - 添加组件到 Canvas
    function addComponentToCanvas(componentId, componentName, imageUrl, layer) {
        if (!imageUrl) return;

        components[componentId] = {
            id: componentId,
            name: componentName,
            imageUrl: imageUrl,
            layer: layer,
            loaded: false,
            image: null,
            visible: true
        };

        // 预加载图片
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const component = components[componentId];
            if (component) {
                component.loaded = true;
                component.image = img;
                scheduleRender(currentHighlightedComponentId);
            }
        };
        img.onerror = () => {
            console.error('组件图片加载失败:', imageUrl);
        };
        img.src = imageUrl;
    }

    // 从 Canvas 移除组件
    function removeComponentFromCanvas(componentId) {
        delete components[componentId];
        scheduleRender(currentHighlightedComponentId);
    }

    // 渲染 Canvas（叠加所有选中的组件）
    function renderCanvas(highlightId) {
        const container = document.getElementById('imageContainer');
        const canvas = document.getElementById('mainCanvas');
        const previewImage = document.getElementById('previewImage');
        const placeholder = document.getElementById('placeholder');

        if (!canvas) {
            console.error('Canvas element not found');
            return;
        }

        const ctx = canvas.getContext('2d');

        // 如果没有选中任何组件，显示占位符
        if (Object.keys(components).length === 0) {
            canvas.style.display = 'none';
            if (previewImage && previewImage.src) {
                previewImage.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            } else if (placeholder) {
                placeholder.style.display = 'flex';
            }
            return;
        }

        // 显示 Canvas，隐藏其他
        canvas.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';

        // 获取所有已加载的组件
        const loadedComponents = Object.values(components)
            .filter(comp => comp.loaded && comp.image && comp.visible)
            .sort((a, b) => a.layer - b.layer); // 按层级排序

        if (loadedComponents.length === 0) {
            // 还没有加载完成的图片
            return;
        }

        // 清空 Canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 先绘制所有组件
        loadedComponents.forEach(component => {
            ctx.drawImage(component.image, 0, 0, canvas.width, canvas.height);
        });

        // 再单独绘制高亮组件，确保可见
        if (outlineEnabled && outlineMode === 'hover' && highlightId) {
            const outlined = getOutlinedImage(highlightId);
            if (outlined) {
                ctx.drawImage(outlined, 0, 0, canvas.width, canvas.height);
            }
        }

        console.log('Canvas 渲染完成，组件数量:', loadedComponents.length);
        initAnalysisCanvases();
        setupMouseEvents();
    }
    function getOutlinedImage(componentId) {
        if (outlineCache[componentId]) return outlineCache[componentId];
        const comp = components[componentId];
        if (!comp || !comp.image) return null;

        const offscreen = document.createElement('canvas');
        offscreen.width = comp.image.width;
        offscreen.height = comp.image.height;
        const octx = offscreen.getContext('2d');

        // 简单描边：四向偏移 + 原图
        octx.clearRect(0, 0, offscreen.width, offscreen.height);
        octx.globalCompositeOperation = 'source-over';
        octx.fillStyle = '#ff5000';
        octx.drawImage(comp.image, -2, 0);
        octx.drawImage(comp.image, 2, 0);
        octx.drawImage(comp.image, 0, -2);
        octx.drawImage(comp.image, 0, 2);
        octx.globalCompositeOperation = 'source-in';
        octx.fillStyle = '#ff5000';
        octx.fillRect(0, 0, offscreen.width, offscreen.height);
        octx.globalCompositeOperation = 'source-over';
        octx.drawImage(comp.image, 0, 0);

        outlineCache[componentId] = offscreen;
        return offscreen;
    }

    function clearOutlineCache(componentId) {
        if (outlineCache[componentId]) {
            delete outlineCache[componentId];
        }
    }

    function initAnalysisCanvases() {
        const canvas = document.getElementById('mainCanvas');
        if (!canvas) return;

        Object.keys(analysisCtxs).forEach(id => {
            delete analysisCtxs[id];
            delete analysisCanvases[id];
        });

        Object.keys(components).forEach(id => {
            const comp = components[id];
            if (!comp || !comp.visible || !comp.image || !comp.loaded) return;
            analysisCanvases[id] = document.createElement('canvas');
            analysisCanvases[id].width = canvas.width;
            analysisCanvases[id].height = canvas.height;
            analysisCtxs[id] = analysisCanvases[id].getContext('2d', { willReadFrequently: true });
            analysisCtxs[id].drawImage(comp.image, 0, 0, canvas.width, canvas.height);
        });
    }

    function setupMouseEvents() {
        if (mouseEventsBound) return;
        const canvas = document.getElementById('mainCanvas');
        const tooltip = document.getElementById('tooltip');
        if (!canvas || !tooltip) return;

        canvas.onmousemove = function (event) {
            if (!analysisCtxs || Object.keys(analysisCtxs).length === 0) {
                if (currentHighlightedComponentId != null) {
                    currentHighlightedComponentId = null;
                    renderCanvas(null);
                }
                tooltip.style.display = 'none';
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = Math.floor((event.clientX - rect.left) * scaleX);
            const y = Math.floor((event.clientY - rect.top) * scaleY);

            let hoveredId = null;
            const ids = Object.keys(analysisCtxs).sort((a, b) => (components[b]?.layer || 0) - (components[a]?.layer || 0));
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                try {
                    const pixel = analysisCtxs[id].getImageData(x, y, 1, 1);
                    if (pixel.data[3] > 0) {
                        hoveredId = id;
                        break;
                    }
                } catch (e) {
                    // ignore read errors
                }
            }

            if (hoveredId !== currentHighlightedComponentId) {
                currentHighlightedComponentId = hoveredId;
                scheduleRender(currentHighlightedComponentId);
            }

            if (hoveredId) {
                tooltip.innerHTML = '组件: ' + (components[hoveredId] ? components[hoveredId].name : hoveredId);
                tooltip.style.display = 'block';
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
            } else {
                tooltip.style.display = 'none';
            }
        };

        canvas.onmouseout = function () {
            if (currentHighlightedComponentId != null) {
                currentHighlightedComponentId = null;
                scheduleRender(null);
            }
            tooltip.style.display = 'none';
        };

        mouseEventsBound = true;
    }

    // 显示单张图片（用于点击列表项时预览）
    function displaySingleImage(imageUrl) {
        const canvas = document.getElementById('mainCanvas');
        const previewImage = document.getElementById('previewImage');
        const placeholder = document.getElementById('placeholder');

        if (canvas) canvas.style.display = 'none';
        if (placeholder) placeholder.style.display = 'none';
        if (!previewImage) return;

        previewImage.onerror = () => {
            console.error("图片加载失败:", imageUrl);
            if (placeholder) {
                placeholder.textContent = "图片加载失败";
                placeholder.style.display = 'flex';
            }
        };

        previewImage.crossOrigin = "anonymous";
        previewImage.src = imageUrl;
        previewImage.style.display = 'block';
    }

    // 10. 显示 Canvas 占位符
    function showCanvasPlaceholder(message) {
        const mainCanvas = document.getElementById('mainCanvas');
        const previewImage = document.getElementById('previewImage');
        const placeholder = document.getElementById('placeholder');

        // 隐藏 Canvas
        if (mainCanvas) {
            mainCanvas.style.display = 'none';
        }

        if (previewImage) {
            previewImage.src = '';
            previewImage.style.display = 'none';
        }
        if (placeholder) {
            placeholder.textContent = message;
            placeholder.style.display = 'flex';
        }
    }

    // 11. 显示占位图片
    function displayPlaceholderImage(projectName) {
        const canvas = document.getElementById('mainCanvas');
        const previewImage = document.getElementById('previewImage');
        const placeholder = document.getElementById('placeholder');

        // 隐藏 Canvas，显示容器
        if (canvas) {
            canvas.style.display = 'none';
        }
        if (previewImage) {
            previewImage.src = '';
            previewImage.style.display = 'none';
        }
        if (placeholder) {
            placeholder.innerHTML = `
                <div style="font-size: 24px; margin-bottom: 10px;">📦</div>
                <div>${projectName}</div>
                <div style="font-size: 12px; color: #999; margin-top: 5px;">暂无产品图片</div>
            `;
            placeholder.style.display = 'flex';
        }
    }

    // 12. 显示图片（用于产品主图）
    function displayImage(imageUrl) {
        const canvas = document.getElementById('mainCanvas');
        const previewImage = document.getElementById('previewImage');
        const placeholder = document.getElementById('placeholder');

        // 隐藏 Canvas，显示容器
        if (canvas) {
            canvas.style.display = 'none';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (!previewImage) return;

        previewImage.onload = () => {};
        previewImage.onerror = () => {
            console.error("图片加载失败:", imageUrl);
            if (placeholder) {
                placeholder.textContent = "图片加载失败";
                placeholder.style.display = 'flex';
            }
        };
        currentBaseImageUrl = imageUrl || '';
        previewImage.crossOrigin = "anonymous";
        previewImage.src = imageUrl;
        previewImage.style.display = 'block';
    }

    // 12. 切换标注选项
    function toggleAnnotation(annotationKey, annotationName, posX, posY, imageUrl, isChecked) {
        if (isChecked) {
            selectedAnnotations.set(annotationKey, {
                name: annotationName,
                posX,
                posY,
                imageUrl
            });
            // 可选配件同样叠加到 Canvas
            addComponentToCanvas(annotationKey, annotationName, imageUrl, posX || 0);
        } else {
            selectedAnnotations.delete(annotationKey);
            removeComponentFromCanvas(annotationKey);
        }

        console.log("当前选中的可选配件:", Array.from(selectedAnnotations.entries()).map(([id, data]) => ({id, ...data})));
        scheduleRender(currentHighlightedComponentId);
    }

    // 13. 清空右侧面板
    function clearRightPanels() {
        document.getElementById('detailList').innerHTML = '';
        document.getElementById('annotationList').innerHTML = '';
        showCanvasPlaceholder('← 选择产品后显示图片');
    }

    // 17. 清除全部
    function clearAll() {
        currentCategoryId = null;
        currentCategoryName = null;
        currentProjectId = null;
        currentProjectName = null;
        selectedDetails.clear();
        selectedAnnotations.clear();
        
        document.querySelectorAll('.listbox-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if (!cb.disabled) cb.checked = false;
        });
        
        document.getElementById('projectList').innerHTML = '';
        clearRightPanels();
    }

    // 18. 显示错误
    function showError(message) {
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = `<div class="error">${message}</div>`;
    }

    // 19. 确认提交
    async function confirmData() {
        if (!currentCategoryId || !currentProjectId) {
            console.warn('请先选择产品类型和产品型号');
            return;
        }

        if (selectedDetails.size === 0) {
            console.warn('请至少选择一个组件');
            return;
        }

        // 获取合成图片（如果有）
        let compositeImageBase64 = null;
        const canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
        if (canvas && canvas.style.display !== 'none') {
            try {
                compositeImageBase64 = canvas.toDataURL('image/png');
                console.log("已导出合成图片，大小:", compositeImageBase64.length);
            } catch (error) {
                console.error("导出合成图片失败:", error);
            }
        }

        const result = {
            categoryId: currentCategoryId,
            category: currentCategoryName,
            projectId: currentProjectId,
            project: currentProjectName,
            details: Array.from(selectedDetails.entries()).map(([id, data]) => ({ id, name: data.name })),
            annotations: Array.from(selectedAnnotations.entries()).map(([id, data]) => ({id, name: data.name})),
            compositeImage: compositeImageBase64  // 添加合成图片
        };

        console.log("✅ 提交数据:", {
            产品类型: result.category,
            产品型号: result.project,
            选中组件: result.details.length + ' 个',
            可选配件: result.annotations.length + ' 个',
            包含合成图片: !!compositeImageBase64
        });

        // 发送给父窗口
        Office.context.ui.messageParent(JSON.stringify(result));
    }

    // 暴露函数到全局作用域，供 HTML onclick 使用
    (window as any).confirmData = confirmData;
    (window as any).clearAll = clearAll;


