import { createStore, applyMiddleware, combineReducers, Middleware, Reducer, Store } from "redux";
import createSagaMiddleware from "redux-saga";
import { composeWithDevTools } from "redux-devtools-extension";
import { createBrowserHistory, createMemoryHistory, History } from "history";
import { all, fork } from "redux-saga/effects";
import { connectRouter } from "connected-react-router";

function sagaWatcher(functions: (() => void)[]) {
  return function* () {
    yield all(functions.map(fn => fork(fn)));
  }
}

type StoreConfig = {
  state?: any
  reducer?: { [key: string]: Reducer }
  sagas?: (() => void)[]
  middlewares?: Middleware[]
  debug?: boolean
}

export function configStore({
  state = {},
  reducer = {},
  sagas = [],
  middlewares,
  debug = false
}: StoreConfig): {store: Store, history: History } {
  const isRN = typeof navigator != 'undefined' && navigator.product == 'ReactNative';
  const history = isRN ? createMemoryHistory() : createBrowserHistory();
  const sagaMiddleware = createSagaMiddleware();
  const appliedMiddleware = applyMiddleware(...(middlewares ? [...middlewares, sagaMiddleware] : [sagaMiddleware]));
  const store = createStore(
    combineReducers({ ...reducer, router: connectRouter(history) as any }),
    state,
    debug
      ? composeWithDevTools(appliedMiddleware)
      : appliedMiddleware
  );
  sagaMiddleware.run(sagaWatcher(sagas));
  return {
    store,
    history
  }
};