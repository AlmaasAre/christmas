'use strict';

angular.module('christmasApp')
  .controller('MainCtrl', function ($scope, angularFire, $rootScope) {


        $scope.checkDate = function (day) {
            return new Date().getDate <= day;
        }

        $scope.calendar = [];
        $scope.selectedItem = {};
        angularFire(new Firebase('https://christmas.firebaseio.com/fap'), $scope, 'calendar').then(function () {

            $rootScope.loadsanta = true;

        });

        $scope.flipCalendar = function (i, imgUrl) {
            if($scope.calendar[i-1].flipped)
            {
                document.getElementById('punch').click();
                $scope.selectedItem.day = i;
                $scope.selectedItem.imgUrl = null;
                $scope.selectedItem.imgUrl = imgUrl;
                return;
            }

            var date = new Date();

            /*BEFORE PRODUCTION: Set month condition!*/
            if(i > date.getDate()/* || date.getMonth() != 11*/)
            {
                document.getElementById('fail').click();
                return;
            }

            $scope.calendar[i-1].flipped = !$scope.calendar[i-1].flipped;
            $scope.selectedItem.day = i;
            $scope.selectedItem.imgUrl = null;
            $scope.selectedItem.imgUrl = imgUrl;

            setTimeout(function () {
                document.getElementById('punch').click();
            }, 1000);
        };


        /**
         * modalEffects.js v1.0.0
         * http://www.codrops.com
         *
         * Licensed under the MIT license.
         * http://www.opensource.org/licenses/mit-license.php
         *
         * Copyright 2013, Codrops
         * http://www.codrops.com
         */
        var ModalEffects = (function() {

            function init() {

                var overlay = document.querySelector( '.md-overlay' );

                [].slice.call( document.querySelectorAll( '.md-trigger' ) ).forEach( function( el, i ) {

                    var modal = document.querySelector( '#' + el.getAttribute( 'data-modal' ) );

                    function removeModal( hasPerspective ) {
                        classie.remove( modal, 'md-show' );

                        if( hasPerspective ) {
                            classie.remove( document.documentElement, 'md-perspective' );
                        }
                    }

                    function removeModalHandler() {
                        removeModal( classie.has( el, 'md-setperspective' ) );
                    }

                    el.addEventListener( 'click', function( ev ) {

                        classie.add( modal, 'md-show' );
                        overlay.removeEventListener( 'click', removeModalHandler );
                        overlay.addEventListener( 'click', removeModalHandler );

                        if( classie.has( el, 'md-setperspective' ) ) {
                            setTimeout( function() {
                                classie.add( document.documentElement, 'md-perspective' );
                            }, 25 );
                        }
                    });



                } );

            }

            init();

        })();



  });
