import { normalize, schema } from "normalizr";
import { AnyAction, Reducer } from "redux";
import { push } from "connected-react-router";
import { take, put, fork, call } from "redux-saga/effects";

const itemSchema = new schema.Entity("items");

const CREATE_ACTION_REGEX = /^create_/i;
const UPDATE_ACTION_REGEX = /^update_/i;
const DETAIL_ACTION_REGEX = /^detail_/i;
const DELETE_ACTION_REGEX = /^delete_/i;
const GETALL_ACTION_REGEX = /^getall_/i;
const ACTION_REQUEST_REGEX = /_request$/i;
const ACTION_SUCCESS_REGEX = /_success$/i;
const ACTION_FAILURE_REGEX = /_failure$/i;

export const toCamelKey = (key: string) => {
  return key.toLowerCase().replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  });
};

export interface IModuleState {
  request: RequestState
  items?: { [key: string]: any }
  metadata?: { [key: string]: any }
}

type RequestState = {
  [key: string]: { 
    isFetching: boolean
    made?: boolean
    errors?: any[] | string
  }
}

type ActionFn = (payload: any) => AnyAction

type ActionFnMap = {
  request: ActionFn
  success: ActionFn
  failure: ActionFn
  doThing: ActionFn
}

type ModuleReducer = (state: IModuleState, payload: any) => IModuleState

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

function reduceItemsState(state: {[key: string]: any}, action: AnyAction): {[key: string]: any} {
  if (!action.type.match(ACTION_SUCCESS_REGEX)) {
    return state;
  }
  const newState = { ...state };
  switch (action.type) {
    case (action.type.match(CREATE_ACTION_REGEX) || {}).input:
      newState[action.payload.response.data.id] = action.payload.response.data;
      break;
    case (action.type.match(UPDATE_ACTION_REGEX) || {}).input:
    case (action.type.match(DETAIL_ACTION_REGEX) || {}).input:
      newState[action.payload.params.id] = action.payload.response.data;
      break;
    case (action.type.match(DELETE_ACTION_REGEX) || {}).input:
      delete newState[action.payload.params.id];
      break;
    case (action.type.match(GETALL_ACTION_REGEX) || {}).input:
      Object.assign(newState, action.payload.response.data);
      break;
  }
  return newState;
}

function reduceRequestState(state: RequestState, action: AnyAction): RequestState {
  const newState = { ...state };
  const errors = action.payload.error?.errors || action.payload.error?.message;
  switch (action.type) {
    case (action.type.match(UPDATE_ACTION_REGEX) || {}).input:
    case (action.type.match(DETAIL_ACTION_REGEX) || {}).input:
      switch (action.type) {
        case (action.type.match(ACTION_REQUEST_REGEX) || {}).input:
          newState[action.payload.params.id] = {
            isFetching: true,
            made: !!newState[action.payload.params.id]?.made
          };
          break;
        case (action.type.match(ACTION_SUCCESS_REGEX) || {}).input:
        case (action.type.match(ACTION_FAILURE_REGEX) || {}).input:
          newState[action.payload.params.id] = {
            isFetching: false,
            made: true,
            errors
          };
          break;
      }
      break;
    default:
      const actionType = action.type.split('_')[0].replace(/[^a-zA-Z]+/, '').toLowerCase();
      switch (action.type) {
        case (action.type.match(ACTION_REQUEST_REGEX) || {}).input:
          newState[actionType] = { isFetching: true };
          break;
        case (action.type.match(ACTION_SUCCESS_REGEX) || {}).input:
        case (action.type.match(ACTION_FAILURE_REGEX) || {}).input:
          newState[actionType] = { isFetching: false, errors };
          break;
      }
      break;
  }
  return newState;
}

function reduceMetadataState(state: {[key: string]: any}, action: AnyAction): {[key: string]: any} {
  if (!action.type.match(ACTION_SUCCESS_REGEX)) {
    return state;
  }
  const newState = {
    ...state,
    ...action.payload.response.metadata
  };
  if (!Array.isArray(newState.ids)) return newState;
  switch (action.type) {
    case (action.type.match(CREATE_ACTION_REGEX) || {}).input:
      newState.ids.unshift(action.payload.response.data.id);
      break;
    case (action.type.match(DELETE_ACTION_REGEX) || {}).input:
      const eIndex = newState.ids.indexOf(action.payload.params.id);
      eIndex > -1 && newState.ids.splice(eIndex, 1);
      break;
    case (action.type.match(GETALL_ACTION_REGEX) || {}).input:
      newState.ids = action.payload.response.ids;
      break;
  }
  return newState;
}

export const moduleOutput = (inputs: ModuleInput[]) => (initState: IModuleState): ModuleOutput => {
  const reducer: Reducer = (state: IModuleState = initState, action: AnyAction) => {
    if ((action.type.match(/wipe_all_state/i) || {}).input) {
      return initState;
    }
    for (const input of inputs) {
      const actionType = getActionType(input.action);
      if (
        action.type !== actionType.request &&
        action.type !== actionType.success &&
        action.type !== actionType.failure
      ) continue;
      const newState = {
        ...state,
        request: reduceRequestState(state.request, action),
        ...(state.items && {
          items: reduceItemsState(state.items, action)
        }),
        ...(state.metadata && {
          metadata: reduceMetadataState(state.metadata, action)
        })
      };
      switch (action.type) {
        case actionType.request:
          return input.onRequest ? input.onRequest(newState, action.payload) : newState;
        case actionType.success:
          return input.onSuccess ? input.onSuccess(newState, action.payload) : newState;
        case actionType.failure:
          return input.onFailure ? input.onFailure(newState, action.payload) : newState;
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