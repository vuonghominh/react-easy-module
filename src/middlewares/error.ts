import { take, put, fork } from "redux-saga/effects";
import { push } from "connected-react-router";

export interface IState {
  status?: number
  message?: string
}

interface IAction {
  type: string
  payload: any
}

const FAILURE_REGEX = /_failure$/i;
const DO_WIPE_ERROR = "DO_WIPE_ERROR";

export function errorReducer(state: IState = {}, action: IAction) {
  switch (action.type) {
    case (action.type.match(FAILURE_REGEX) || {}).input:
      const error = action.payload && action.payload.error;
      return {
        message: error && error.message,
        status: error && error.status
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