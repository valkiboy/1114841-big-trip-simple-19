import { render, remove, RenderPosition } from '../framework/render.js';
import UiBlocker from '../framework/ui-blocker/ui-blocker.js';
import ListView from '../view/list-view.js';
import TripSortView from '../view/trip-sort-view.js';
import NoPointView from '../view/no-point-view.js';
import LoadingView from '../view/loading-view.js';
import PointsErrorView from '../view/points-error-view.js';
import PointPresenter from './point-presenter.js';
import NewPointPresenter from './new-point-presenter.js';
import { SortType, FilterType, UpdateType, UserAction } from '../const.js';
import { sortPointDay, sortPointPrice } from '../util/util.js';
import { filter } from '../util/filter.js';

const TimeLimit = {
  LOWER_LIMIT: 350,
  UPPER_LIMIT: 1000,
};

export default class ListPresenter {
  #listContainer = null;
  #pointsModel = null;
  #filterModel = null;
  #listComponent = new ListView();
  #loadingComponent = new LoadingView();
  #pointsErrorComponent = new PointsErrorView();
  #pointPresenter = new Map();
  #currentSortType = SortType.DAY;
  #currentFilterType = FilterType.EVERYTHING;
  #filterType = FilterType.EVERYTHING;
  #sortComponent = null;
  #noPointComponent = null;
  #newPointPresenter = null;
  #newPointButtonDisable = null;
  #isLoading = true;
  #isNewEventOpened = false;
  #pointsError = false;
  #uiBlocker = new UiBlocker({
    lowerLimit: TimeLimit.LOWER_LIMIT,
    upperLimit: TimeLimit.UPPER_LIMIT
  });

  constructor({listContainer, pointsModel, filterModel, onNewPointDestroy, onNewPointButtonDisable}) {
    this.#listContainer = listContainer;
    this.#pointsModel = pointsModel;
    this.#filterModel = filterModel;
    this.#newPointButtonDisable = onNewPointButtonDisable;

    this.#newPointPresenter = new NewPointPresenter({
      listContainer: this.#listComponent.element,
      onDataChange: this.#handleViewAction,
      onDestroy: () => {
        onNewPointDestroy();
        if (this.points.length === 0) {
          this.#renderList();
        }
      }
    });

    this.#pointsModel.addObserver(this.#handleModelEvent);
    this.#filterModel.addObserver(this.#handleModelEvent);
  }

  get points() {
    this.#filterType = this.#filterModel.filter;
    const points = this.#pointsModel.points;
    const filterPoints = filter[this.#filterType](points);

    switch (this.#currentSortType) {
      case SortType.DAY:
        return filterPoints.sort(sortPointDay);
      case SortType.PRICE:
        return filterPoints.sort(sortPointPrice);
    }

    return this.#pointsModel.points;
  }

  init() {
    this.#renderList();
  }

  createPoint() {
    this.#isNewEventOpened = true;
    this.#currentSortType = SortType.DAY;
    this.#filterModel.setFilter(UpdateType.MAJOR, FilterType.EVERYTHING);
    this.#newPointPresenter.init(this.#pointsModel.blankPoint);
  }

  #handleViewAction = async (actionType, updateType, update) => {
    this.#uiBlocker.block();
    switch (actionType) {
      case UserAction.UPDATE_POINT:
        this.#pointPresenter.get(update.id).setSaving();
        try {
          await this.#pointsModel.updatePoint(updateType, update);
        } catch(err) {
          this.#pointPresenter.get(update.id).setAborting();
        }
        break;
      case UserAction.ADD_POINT:
        this.#newPointPresenter.setSaving();
        try {
          await this.#pointsModel.addPoint(updateType, update);
        } catch(err) {
          this.#newPointPresenter.setAborting();
        }
        break;
      case UserAction.DELETE_POINT:
        this.#pointPresenter.get(update.id).setDeleting();
        try {
          await this.#pointsModel.deletePoint(updateType, update);
        } catch(err) {
          this.#pointPresenter.get(update.id).setAborting();
        }
        break;
    }
    this.#uiBlocker.unblock();
  };

  #handleModelEvent = (updateType, data) => {
    switch (updateType) {
      case UpdateType.PATCH:
        this.#pointPresenter.get(data.id).init(data);
        break;
      case UpdateType.MINOR:
        this.#clearList();
        this.#renderList();
        break;
      case UpdateType.MAJOR:
        this.#clearList({resetSortType: true, resetFilterType: true});
        this.#renderList();
        break;
      case UpdateType.INIT:
        this.#isLoading = false;
        remove(this.#loadingComponent);
        remove(this.#pointsErrorComponent);
        this.#renderSort();
        this.#renderList();
        break;
    }
  };

  #handleModeChange = () => {
    this.#newPointPresenter.destroy();
    this.#pointPresenter.forEach((presenter) => presenter.resetView());
  };

  #handleSortTypeChange = (sortType) => {
    if (this.#currentSortType === sortType) {
      return;
    }
    this.#currentSortType = sortType;
    this.#clearSort();
    this.#renderSort();
    this.#clearList();
    this.#renderList();
  };

  #renderPoint(point) {
    const pointPresenter = new PointPresenter({
      listContainer: this.#listComponent.element,
      onDataChange: this.#handleViewAction,
      onModeChange: this.#handleModeChange
    });

    pointPresenter.init(point);
    this.#pointPresenter.set(point.id, pointPresenter);
  }

  #renderLoading() {
    render(this.#loadingComponent, this.#listComponent.element, RenderPosition.BEFOREBEGIN);
  }

  #renderPointsError() {
    render(this.#pointsErrorComponent, this.#listComponent.element, RenderPosition.BEFOREBEGIN);
  }

  #renderSort() {
    this.#sortComponent = new TripSortView({
      onSortTypeChange: this.#handleSortTypeChange,
      currentSortType: this.#currentSortType
    });
    if (this.#pointsModel.points.every((point) => point === null)) {
      return;
    }
    render (this.#sortComponent, this.#listComponent.element, RenderPosition.BEFOREBEGIN);
  }

  #renderNoPointComponent() {
    this.#noPointComponent = new NoPointView ({
      filterType: this.#filterType
    });

    render(this.#noPointComponent, this.#listComponent.element, RenderPosition.BEFOREBEGIN);
  }

  #clearSort() {
    remove(this.#sortComponent);
  }

  #clearList({resetSortType = false, resetFilterType = false} = {}) {

    this.#newPointPresenter.destroy();
    this.#pointPresenter.forEach((presenter) => presenter.destroy());
    this.#pointPresenter.clear();

    remove(this.#loadingComponent);
    remove(this.#pointsErrorComponent);

    if (this.#noPointComponent) {
      remove(this.#noPointComponent);
    }

    if (resetSortType) {
      this.#currentSortType = SortType.DAY;
      this.#clearSort();
      this.#renderSort();
    }

    if (resetFilterType) {
      this.#currentFilterType = FilterType.EVERYTHING;
    }
  }

  #renderList() {
    render(this.#listComponent, this.#listContainer);

    const points = this.points;
    const pointCount = points.length;

    if (this.#isLoading) {
      this.#renderLoading();
      return;
    }

    if (this.#pointsModel.pointsError === true) {
      this.#renderPointsError();
      this.#newPointButtonDisable();
      return;
    }

    if (pointCount === 0 && this.#isNewEventOpened === false ) {
      this.#clearSort();
      this.#renderNoPointComponent();
    }

    for (let i = 0; i < pointCount; i++) {
      this.#renderPoint(points[i]);
    }

    this.#isNewEventOpened = false;
  }
}
