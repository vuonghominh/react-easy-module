import { normalize, schema } from "normalizr";
import { createStore, applyMiddleware, Reducer, combineReducers } from "redux";
import createSagaMiddleware from "redux-saga";
import { composeWithDevTools } from "redux-devtools-extension";
import { createBrowserHistory, History } from "history";
import { routerMiddleware, push, connectRouter } from "connected-react-router";
import { persistStore, persistReducer, PersistConfig } from "redux-persist";
import storage from "redux-persist/lib/storage";
import { all, take, put, fork, call } from "redux-saga/effects";

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

interface IAction {
  type: string
  payload: any
}

interface IActions {
  request: (payload: any) => IAction
  success: (payload: any) => IAction
  failure: (payload: any) => IAction
  doThing: (payload: any) => IAction
}

interface IModule {
  reducer: (state: IState, action: IAction) => any
  sagas: (() => void)[]
  actions: { [key: string]: (_: any) => IAction }
}

interface IInput {
  action: string
  apiPayload: (_payload: any) => any
  onRequest?: (state: IState, payload: any) => any
  onSuccess?: (state: IState, payload: any) => any
  onFailure?: (state: IState, payload: any) => any
}

function buildTypes(action: string): { [key: string]: string } {
  return {
    request: `${action}_REQUEST`,
    success: `${action}_SUCCESS`,
    failure: `${action}_FAILURE`,
    doThing: `DO_${action}`
  }
}

function buildActions(action: string): IActions {
  const types = buildTypes(action);
  return {
    request: (payload: any) => ({type: types.request, payload}),
    success: (payload: any) => ({type: types.success, payload}),
    failure: (payload: any) => ({type: types.failure, payload}),
    doThing: (payload: any) => ({type: types.doThing, payload})
  }
}

function newItemsState(items: {[key: string]: any}, action: IAction): {[key: string]: any} {
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

function newMetadataState(metadata: {[key: string]: any}, action: IAction): {[key: string]: any} {
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

export const buildModule = (inputs: IInput[]) => (initState: IState | Function): IModule => {
  const getInitState = () => ((typeof initState === "function") ? initState() : initState);
  const reducer = (state: IState = getInitState(), action: IAction) => {
    if ((action.type.match(/logout_success/i) || {}).input) {
      return getInitState();
    }
    for (const input of inputs) {
      const types = buildTypes(input.action);
      switch (action.type) {
        case types.request:
          return Object.assign(
            {},
            state,
            state.loaded && action.payload.params && action.payload.params.id
            ? { loaded: {...state.loaded, [action.payload.params.id]: false} }
            : {},
            input.onRequest && input.onRequest(state, action.payload),
            { isFetching: true }
          )
        case types.success:
          return Object.assign(
            {},
            state,
            state.loaded && action.payload.params && action.payload.params.id
            ? { loaded: {...state.loaded, [action.payload.params.id]: true} }
            : {},
            state.items
            ? {
              items: newItemsState(state.items, action)
            }
            : {},
            state.metadata
            ? {
              metadata: newMetadataState(state.metadata, action)
            }
            : {},
            input.onSuccess && input.onSuccess(state, action.payload),
            { isFetching: false }
          )
        case types.failure:
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
  const doActions: { [key: string]: (_: any) => IAction } = {};
  for (const input of inputs) {
    const actions = buildActions(input.action);
    const key = toCamelKey(`DO_${input.action}`);
    doActions[key] = actions.doThing;
  }
  const sagas = [];
  for (const input of inputs) {
    const actions = buildActions(input.action);
    const types = buildTypes(input.action);
    const fetchData = function*(api: any, params: any, next?: string | Function) {
      yield put(actions.request({params}));
      const { response, error } = yield call(api, params);
      if (response) {
        const responseData = {...response};
        if (Array.isArray(response.data)) {
          const normalized = normalize(response.data, [itemSchema]);
          responseData.data = normalized.entities.items;
          responseData.ids = normalized.result;
        }
        yield put(actions.success({response: responseData, params}));
        if (next) {
          const nextRoute = (typeof next === "function") ? next(responseData) : next;
          yield put(push(nextRoute));
        }
      } else {
        yield put(actions.failure({error, params}));
      }
    }
    const saga = function*() {
      while (true) {
        const { payload } = yield take(types.doThing);
        const { api, params, next } = input.apiPayload(payload);
        yield fork(fetchData, api, params, next);
      }
    }
    sagas.push(saga);
  }
  return {
    actions: doActions,
    sagas,
    reducer
  }
}


export function* rootSaga(functions: (() => void)[]) {
  yield all([...functions.map(fn => fork(fn))]);
}

export function rootReducers(
  history: History,
  reducerMap: { [key: string]: () => void }
): Reducer {
  return combineReducers({
    router: connectRouter(history),
    ...reducerMap
  });
}

export function configStore(
  initialState: any,
  opts: {
    persistConfig: PersistConfig<any>,
    reducer: (_: History) => Reducer,
    saga: any,
    debug?: boolean
  }
) {
  const { saga, reducer, debug } = opts;
  const persistConfig = Object.assign({
    key: 'root',
    storage,
    whitelist: []
  }, opts.persistConfig);
  const history = createBrowserHistory();
  const persistedReducer = persistReducer(persistConfig, reducer(history));
  const sagaMiddleware = createSagaMiddleware();
  const middlewares = [routerMiddleware(history), sagaMiddleware];
  const store = createStore(
    persistedReducer,
    initialState,
    debug
      ? applyMiddleware(...middlewares)
      : composeWithDevTools(applyMiddleware(...middlewares))
  );
  sagaMiddleware.run(saga);
  return {
    store,
    history,
    persistor: persistStore(store)
  };
};

export const sum = (a: number, b: number): number => a + b
