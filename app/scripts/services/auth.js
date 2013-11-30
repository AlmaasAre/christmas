'use strict';

angular.module('christmasApp')
  .service('Auth', function Auth($http) {

        var _model = {
            isLoggedIn:false
        };
;

        var _isLoggedIn = function () {

                return _model.isLoggedIn;
            },
            _login = function (username, password) {
                if(username == 'mralmaas@gmail.com' && password == 'eplemoshansen')
                {
                    _model.isLoggedIn = true;
                    return true;

                }
                return false;

            },
            _logout = function () {
                _model.isLoggedIn = false;
            };



        return {
            isLoggedIn: _isLoggedIn,
            login: _login,
            logout: _logout
        }

  });
