'use strict';

angular.module('christmasApp')
  .service('Auth', function Auth($http) {


        var _isLoggedIn = function () {

                return true;
            },
            _login = function (username, password) {

            },
            _logout = function () {

            };



        return {
            isLoggedIn: _isLoggedIn,
            login: _login,
            logout: _logout
        }

  });
