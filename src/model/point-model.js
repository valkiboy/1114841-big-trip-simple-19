import {getRandomPoint} from '../mock/local-points.js';

const POINT_COUNT = 5;

export default class PointModel {
  points = Array.from({length: POINT_COUNT}, getRandomPoint);

  getPoint() {
    return this.points;
  }
}
