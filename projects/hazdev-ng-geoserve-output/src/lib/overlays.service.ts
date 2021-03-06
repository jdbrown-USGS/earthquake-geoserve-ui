import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable, of, BehaviorSubject } from 'rxjs';
import { catchError } from 'rxjs/operators';

import * as L from 'leaflet';

import { environment } from '../environments/environment';

@Injectable()
export class OverlaysService {
  readonly LAYERS_URL = environment.apiUrl + 'layers.json';
  overlays$: BehaviorSubject<any> = new BehaviorSubject<any>(null);
  regionOverlays = {};

  private readonly COLORS = [
    '#1f78b4', // teal
    '#ffff99', // yellow
    '#33a02c', // green
    '#e31a1c', // red
    '#ff7f00', // orange
    '#6a3d9a', // purple
    '#b15928' // brown
  ];
  private COLORS_INDEX = 0;

  constructor(private http: HttpClient) {}

  buildRegionLayer(overlay: any): void {
    const color = this.COLORS[this.COLORS_INDEX++ % this.COLORS.length];
    const http = this.http;
    const errorHandler = this.handleError;

    const regionsLayer = L.GeoJSON.extend({
      _loadData: function() {
        let url;

        url = this._url + '?type=' + this._type;

        http
          .get(url)
          .pipe(catchError(errorHandler('loadData', null)))
          .subscribe(data => {
            if (data === null) {
              // let user try again
              this._loaded = false;
              return;
            }
            this.addData(data[this._type]);
          });
      },

      // Not sure how to make angular call super class initialize,
      // so cheat and set defaults this way
      _loaded: false,
      _type: overlay.name,
      _url: this.LAYERS_URL,

      onAdd: function(map) {
        L.GeoJSON.prototype.onAdd.call(this, map);
        // fetch data once
        if (!this._loaded) {
          this._loaded = true;
          this._loadData();
        }
      },

      // set styles on the layer
      options: {
        style: {
          clickable: false,
          color: color,
          fillOpacity: 0.4,
          opacity: 1,
          weight: 2
        }
      }
    });

    return new regionsLayer();
  }

  /**
   * build an array of regions layers
   */
  buildRegionLayers(overlays: any[]): void {
    overlays.forEach(overlay => {
      this.regionOverlays[overlay.title] = this.buildRegionLayer(overlay);
    });

    this.overlays$.next(this.regionOverlays);
  }

  empty(): void {
    this.overlays$.next(null);
  }

  /**
   * Fetch overlays from geoserve ws
   */
  getOverlays(): void {
    let overlays;

    this.http
      .get<any>(this.LAYERS_URL)
      .pipe(
        catchError(
          this.handleError('getOverlays', {
            parameters: {
              required: {
                type: {
                  values: []
                }
              }
            }
          })
        )
      )
      .subscribe(response => {
        overlays = response.parameters.required.type.values;
        if (overlays && overlays.length !== 0) {
          this.buildRegionLayers(overlays);
        }
      });
  }

  private handleError<T>(action: string, result?: T) {
    return (error: any): Observable<T> => {
      console.error(error);
      return of(result as T);
    };
  }
}
