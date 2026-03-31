import React from "react";

export type DialogIndustryItem = {
  value: string;
  label: string;
  shortName?: string;
  sortOrder?: number;
};

export type DialogCategoryItem = {
  id: string | number;
  name: string;
};

export type DialogProjectItem = {
  id: string | number;
  name: string;
  imageUrl?: string;
  baseDescription?: string;
  standardPrice?: number | null;
};

export type DialogDetailItem = {
  id: string | number;
  name: string;
  checked: boolean;
  required: boolean;
  previewId: string;
};

export type DialogAnnotationItem = {
  key: string;
  name: string;
  checked: boolean;
  previewId: string;
};

export type DialogViewState = {
  currentMaterialPreset: string;
  materialOptions: DialogIndustryItem[];
  categoryTitle: string;
  projectTitle: string;
  detailTitle: string;
  annotationTitle: string;
  previewTitle: string;
  clearAllText: string;
  confirmSubmitText: string;
  categories: DialogCategoryItem[];
  categoriesLoading: boolean;
  categoryError: string;
  projects: DialogProjectItem[];
  projectsLoading: boolean;
  projectError: string;
  details: DialogDetailItem[];
  detailsLoading: boolean;
  detailError: string;
  annotations: DialogAnnotationItem[];
  annotationsLoading: boolean;
  annotationError: string;
  detailBaseDescription: string;
  hoveredPreviewId: string | null;
  selectedCategoryId: string | number | null;
  selectedProjectId: string | number | null;
};

export type DialogViewHandlers = {
  onMaterialPresetChange: (value: string) => void;
  onCategoryClick: (id: string | number, name: string) => void;
  onProjectClick: (id: string | number, name: string) => void;
  onDetailToggle: (id: string | number, checked: boolean) => void;
  onAnnotationToggle: (key: string, checked: boolean) => void;
  onPreviewHoverChange: (previewId: string | null) => void;
  onClearAll: () => void;
  onConfirmSubmit: () => void;
};

function renderListContent(
  loading: boolean,
  error: string,
  items: React.ReactNode[],
  emptyText: string
) {
  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!items.length) return <div className="placeholder">{emptyText}</div>;
  return items;
}

function detailLabelClass(required: boolean) {
  return required ? "listbox-item-label listbox-item-label--required" : "listbox-item-label";
}

export function DialogApp({
  state,
  handlers,
}: {
  state: DialogViewState;
  handlers: DialogViewHandlers;
}) {
  const materialOptions = state.materialOptions || [];
  const activeIndex = materialOptions.findIndex((item) => item.value === state.currentMaterialPreset);
  const thumbWidth = materialOptions.length ? `calc((100% - 6px) / ${materialOptions.length})` : "0";
  const trackColumns = materialOptions.length ? `repeat(${materialOptions.length}, minmax(0, 1fr))` : "1fr";

  return (
    <div className="container">
      <div className="material-selector-panel" id="materialSelectorPanel">
        <div
          className="material-selector-track"
          id="materialSelectorTrack"
          style={{ gridTemplateColumns: trackColumns }}
        >
          <div
            className="material-selector-thumb"
            id="materialSelectorThumb"
            style={{
              width: thumbWidth,
              transform: `translateX(${Math.max(0, activeIndex) * 100}%)`,
              display: materialOptions.length ? "block" : "none",
            }}
          />
          {materialOptions.map((option) => (
            <button
              key={option.value}
              className={`material-selector-option ${state.currentMaterialPreset === option.value ? "active" : ""}`}
              type="button"
              onClick={() => handlers.onMaterialPresetChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="left-panel">
        <h3 className="panel-title">{state.categoryTitle}</h3>
        <div className="listbox ui-listbox" id="categoryList">
          {renderListContent(
            state.categoriesLoading,
            state.categoryError,
            state.categories.map((category) => (
              <div
                key={String(category.id)}
                className={`listbox-item ui-listbox-item ${state.selectedCategoryId == category.id ? "selected is-selected" : ""}`}
                onClick={() => handlers.onCategoryClick(category.id, category.name)}
              >
                {category.name}
              </div>
            )),
            "暂无产品类型"
          )}
        </div>
      </div>

      <div className="middle-panel">
        <div className="middle-left">
          <h3 className="panel-title">{state.projectTitle}</h3>
          <div className="listbox ui-listbox" id="projectList">
            {renderListContent(
              state.projectsLoading,
              state.projectError,
              state.projects.map((project) => (
                <div
                  key={String(project.id)}
                  className={`listbox-item ui-listbox-item ${state.selectedProjectId == project.id ? "selected is-selected" : ""}`}
                  onClick={() => handlers.onProjectClick(project.id, project.name)}
                >
                  {project.name}
                </div>
              )),
              "该类型下暂无产品"
            )}
          </div>
        </div>
      </div>

      <div className="middle-right">
        <div className="detail-panel">
          <h3 className="panel-title">{state.detailTitle}</h3>
          <div className="listbox ui-listbox" id="detailList">
            {renderListContent(
              state.detailsLoading,
              state.detailError,
              state.details.map((detail) => (
                <div
                  key={String(detail.id)}
                  className={`listbox-item ui-listbox-item multi-select ${state.hoveredPreviewId === detail.previewId ? "preview-hovered is-hovered" : ""}`}
                  onMouseEnter={() => handlers.onPreviewHoverChange(detail.previewId)}
                  onMouseLeave={() => handlers.onPreviewHoverChange(null)}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName.toLowerCase() === "input" || detail.required) return;
                    handlers.onDetailToggle(detail.id, !detail.checked);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={detail.checked}
                    disabled={detail.required}
                    onChange={(e) => handlers.onDetailToggle(detail.id, e.target.checked)}
                  />
                  <label className={`${detailLabelClass(detail.required)} ui-listbox-item-label${detail.required ? " ui-listbox-item-label--required" : ""}`}>
                    {detail.name}{detail.required ? " [必选]" : ""}
                  </label>
                </div>
              )),
              "暂无组件信息"
            )}
          </div>
          <div className="detail-base-description-box" id="detailBaseDescriptionBox">
            <div className="detail-base-description-title">基础信息</div>
            <div className="detail-base-description-value" id="detailBaseDescriptionValue">{state.detailBaseDescription || "-"}</div>
          </div>
        </div>

        <div>
          <h3 className="panel-title">{state.annotationTitle}</h3>
          <div className="listbox ui-listbox" id="annotationList">
            {renderListContent(
              state.annotationsLoading,
              state.annotationError,
              state.annotations.map((annotation) => (
                <div
                  key={annotation.key}
                  className={`listbox-item ui-listbox-item multi-select ${state.hoveredPreviewId === annotation.previewId ? "preview-hovered is-hovered" : ""}`}
                  title={`组件信息：${annotation.name || ""}`}
                  onMouseEnter={() => handlers.onPreviewHoverChange(annotation.previewId)}
                  onMouseLeave={() => handlers.onPreviewHoverChange(null)}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName.toLowerCase() === "input") return;
                    handlers.onAnnotationToggle(annotation.key, !annotation.checked);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={annotation.checked}
                    onChange={(e) => handlers.onAnnotationToggle(annotation.key, e.target.checked)}
                  />
                  <label className="listbox-item-label ui-listbox-item-label">{annotation.name}</label>
                </div>
              )),
              "暂无可选配件"
            )}
          </div>
        </div>
      </div>

      <div className="right-panel">
        <h3 className="panel-title">{state.previewTitle}</h3>
        <div className="image-container ui-preview-surface" id="imageContainer">
          <div className="image-stage-plane ui-preview-stage-plane" aria-hidden="true"></div>
          <div id="previewStageMount"></div>
        </div>
        <div className="action-buttons">
          <button className="btn ui-btn ui-btn--secondary" onClick={handlers.onClearAll}>{state.clearAllText}</button>
          <button className="btn ui-btn ui-btn--primary" onClick={handlers.onConfirmSubmit}>{state.confirmSubmitText}</button>
        </div>
      </div>
    </div>
  );
}
