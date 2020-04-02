import { normalize, schema } from "normalizr";
import { AnyAction, Reducer } from "redux";
import { push } from "connected-react-router";
import { take, put, fork, call } from "redux-saga/effects";

export { doWipeError } from "./middlewares/error";

const itemSchema = new schema.Entity("items");

const toCamelKey = (key: string) => {
  return key.toLowerCase().replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  });
};

export interface IState {
  isFetching: boolean
  loaded?: { [key: string]: boolean }
  items?: { [key: string]: any }
  metadata?: { [key: string]: any }
}

type ActionFn = (payload: any) => AnyAction

type ActionFnMap = {
  request: ActionFn
  success: ActionFn
  failure: ActionFn
  doThing: ActionFn
}

export type ModuleReducer = (state: IState, payload: any) => IState

type ModuleOutput = {
  reducer: Reducer
  sagas: (() => void)[]
  actions: { [key: string]: ActionFn }
}

type ModuleInput = {
  action: string
  apiPayload(payload: any): any
  onRequest?: ModuleReducer
  onSuccess?: ModuleReducer
  onFailure?: ModuleReducer
}

function getActionType(action: string): { [key: string]: string } {
  return {
    request: `${action}_REQUEST`,
    success: `${action}_SUCCESS`,
    failure: `${action}_FAILURE`,
    doThing: `DO_${action}`
  }
}

function getActionFnMap(action: string): ActionFnMap {
  const actionType = getActionType(action);
  return {
    request: (payload: any) => ({type: actionType.request, payload}),
    success: (payload: any) => ({type: actionType.success, payload}),
    failure: (payload: any) => ({type: actionType.failure, payload}),
    doThing: (payload: any) => ({type: actionType.doThing, payload})
  }
}

function itemsReducer(items: {[key: string]: any}, action: AnyAction): {[key: string]: any} {
  const state = { ...items };
  switch (action.type) {
    case (action.type.match(/^create_/i) || {}).input:
      state[action.payload.response.data.id] = action.payload.response.data;
      break;
    case (action.type.match(/^update_/i) || {}).input:
    case (action.type.match(/^detail_/i) || {}).input:
      state[action.payload.params.id] = action.payload.response.data;
      break;
    case (action.type.match(/^delete_/i) || {}).input:
      delete state[action.payload.params.id];
      break;
    case (action.type.match(/^getall_/i) || {}).input:
      Object.assign(state, action.payload.response.data);
      break;
  }
  return state;
}

function metadataReducer(metadata: {[key: string]: any}, action: AnyAction): {[key: string]: any} {
  const state = {
    ...metadata,
    ...action.payload.response.metadata
  };
  switch (action.type) {
    case (action.type.match(/^create_/i) || {}).input:
      if (Array.isArray(state.ids)) {
        state.ids.unshift(action.payload.response.data.id);
      }
      break;
    case (action.type.match(/^delete_/i) || {}).input:
      if (Array.isArray(state.ids)) {
        const eIndex = state.ids.indexOf(action.payload.params.id);
        eIndex > -1 && state.ids.splice(eIndex, 1);
      }
      break;
    case (action.type.match(/^getall_/i) || {}).input:
      if (Array.isArray(state.ids) && action.payload.response.ids) {
        state.ids = action.payload.response.ids;
      }
      break;
  }
  return state;
}

export const moduleOutput = (inputs: ModuleInput[]) => (initState: IState | Function): ModuleOutput => {
  const getInitState = () => ((typeof initState === "function") ? initState() : initState);
  const reducer: Reducer = (state: IState = getInitState(), action: AnyAction) => {
    if ((action.type.match(/logout_success/i) || {}).input) {
      return getInitState();
    }
    for (const input of inputs) {
      const actionType = getActionType(input.action);
      switch (action.type) {
        case actionType.request:
          return Object.assign(
            {},
            state,
            state.loaded && action.payload.params && action.payload.params.id
            ? { loaded: {...state.loaded, [action.payload.params.id]: false} }
            : {},
            input.onRequest && input.onRequest(state, action.payload),
            { isFetching: true }
          )
        case actionType.success:
          return Object.assign(
            {},
            state,
            state.loaded && action.payload.params && action.payload.params.id
            ? { loaded: {...state.loaded, [action.payload.params.id]: true} }
            : {},
            state.items
            ? {
              items: itemsReducer(state.items, action)
            }
            : {},
            state.metadata
            ? {
              metadata: metadataReducer(state.metadata, action)
            }
            : {},
            input.onSuccess && input.onSuccess(state, action.payload),
            { isFetching: false }
          )
        case actionType.failure:
          return Object.assign(
            {},
            state,
            state.loaded && action.payload.params && action.payload.params.id
            ? { loaded: {...state.loaded, [action.payload.params.id]: true} }
            : {},
            input.onFailure && input.onFailure(state, action.payload),
            { isFetching: false }
          )
      }
    }
    return state;
  }
  const actions: { [key: string]: (_: any) => AnyAction } = {};
  for (const input of inputs) {
    const actionFnMap = getActionFnMap(input.action);
    const key = toCamelKey(`DO_${input.action}`);
    actions[key] = actionFnMap.doThing;
  }
  const sagas = [];
  for (const input of inputs) {
    const actionFnMap = getActionFnMap(input.action);
    const actionType = getActionType(input.action);
    const fetchData = function*(api: any, params: any, next?: string | Function) {
      yield put(actionFnMap.request({params}));
      const { response, error } = yield call(api, params);
      if (response) {
        const responseData = {...response};
        if (Array.isArray(response.data)) {
          const normalized = normalize(response.data, [itemSchema]);
          responseData.data = normalized.entities.items;
          responseData.ids = normalized.result;
        }
        yield put(actionFnMap.success({response: responseData, params}));
        if (next) {
          const nextRoute = (typeof next === "function") ? next(responseData) : next;
          yield put(push(nextRoute));
        }
      } else {
        yield put(actionFnMap.failure({error, params}));
      }
    }
    const saga = function*() {
      while (true) {
        const { payload } = yield take(actionType.doThing);
        const { api, params, next } = input.apiPayload(payload);
        yield fork(fetchData, api, params, next);
      }
    }
    sagas.push(saga);
  }
  return {
    actions,
    sagas,
    reducer
  }
}