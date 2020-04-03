import { take, put, fork } from "redux-saga/effects";
import { push } from "connected-react-router";
import { AnyAction } from "redux";

export interface IState {
  status?: number
  message?: string
}

const FAILURE_REGEX = /_failure$/i;
const DO_WIPE_ERROR = "DO_WIPE_ERROR";

export function doWipeError() {
  return { type: DO_WIPE_ERROR }
}

export function errorReducer(state: IState = {}, action: AnyAction): IState {
  switch (action.type) {
    case (action.type.match(FAILURE_REGEX) || {}).input:
      return {
        ...state,
        ...(action.payload?.error)
      };
    case DO_WIPE_ERROR:
      return {};
    default:
      return state;
  }
}

function* handleErrorSaga(error: { status: number }) {
  if (error.status === 401) {
    yield put(push('/logout'));
  }
}

export function* errorSaga() {
  while (true) {
    const { payload: { error } } = yield take((a: { type: string; }) => FAILURE_REGEX.test(a.type));
    yield fork(handleErrorSaga, error);
  }
}