<template>
	<router-view id="app" @login="loginDirect" @logout="logoutDirect">
	</router-view>
</template>

<script>
	import Vue from 'vue';
	import instance from './api';
	import userPath from './router/fullpath';
	import * as util from './assets/util.js';
	//请求拦截句柄
	let myInterceptor;
	export default {
		data() {
			return {
				menuData: null,
				userData: null
			}
		},
		methods: {
			getPermission: function(userInfo) {
				let resourcePermission = {};
				if (Array.isArray(userInfo.resources)) {
					userInfo.resources.forEach(function(e, i) {
						let key = e.method.toLowerCase() + ',' + e.url;
						resourcePermission[key] = true;
					});
				}
				// 拿到的resourcePermission是这个
				// {
				// 	"get,/accounts": true,
				// 	"delete,/account/**": true,
				// 	"put,/account/**": true,
				// 	"post,/account/*/roles": true,
				// 	"get,/roles": true,
				// 	"delete,/role/**": true,
				// 	"put,/role/**": true,
				// 	"post,/role": true,
				// 	"get,/signin": true
				// }
				return resourcePermission;
			},
			setInterceptor: function(resourcePermission) {
				let vm = this;
				myInterceptor = instance.interceptors.request.use(function(config) {
					//得到请求路径
					let perName = config.url.replace(config.baseURL, '').replace('/GET', '').replace('/POST', '').split('?')[0];
					//权限格式1 /path/${param}
					let reg1 = perName.match(/^(\/[^\/]+\/)[^\/]+$/);
					if (reg1) {
						perName = reg1[1] + '**';
					}
					//权限格式2 /path/${param}/path
					let reg2 = perName.match(/^\/[^\/]+\/([^\/]+)\/[^\/]+$/);
					if (reg2) {
						perName = perName.replace(reg2[1], '*');
					}
					//校验权限
					if (!resourcePermission[config.method + ',' + perName]) {
						//调试信息
						console.warn(resourcePermission, config.method + ',' + perName);
						vm.$message({
							message: '无访问权限，请联系企业管理员',
							type: 'warning'
						});
						//拦截请求
						return Promise.reject({
							message: 'no permission'
						});
					}
					return config;
				});
			},
			getRoutes: function(userInfo) {
				if (!userInfo.menus) {
					return console.warn(userInfo);
				}
				let vm = this;
				let allowedRouter = [];
				//将菜单数据转成多维数组格式
				let arrayMenus = util.buildMenu(userInfo.menus);
				//将多维数组转成对象格式
				let hashMenus = {};
				let setMenu2Hash = function(array, base) {
					array.map(key => {
						if (key.route) {
							let hashKey = ((base ? base + '/' : '') + key.route).replace(/^\//, '');
							hashMenus['/' + hashKey] = true;
							if (Array.isArray(key.children)) {
								setMenu2Hash(key.children, key.route);
							}
						}
					});
				};
				setMenu2Hash(arrayMenus);
				//全局挂载hashMenus，用于实现路由守卫
				this.$root.hashMenus = hashMenus;
				//筛选本地路由方法
				let findLocalRoute = function(array, base) {
					let replyResult = [];
					array.forEach(function(route) {
						let pathKey = (base ? base + '/' : '') + route.path;
						if (hashMenus[pathKey]) {
							if (Array.isArray(route.children)) {
								route.children = findLocalRoute(route.children, route.path);
							}
							replyResult.push(route);
						}
					});
					if (base) {
						return replyResult;
					} else {
						allowedRouter = allowedRouter.concat(replyResult);
					}
				}
				let originPath = util.deepcopy(userPath[0].children);
				findLocalRoute(originPath);
				return allowedRouter;
			},
			extendRoutes: function(allowedRouter) {
				let vm = this;
				//为动态路由添加独享守卫
				let actualRouter = util.deepcopy(allowedRouter);
				actualRouter.map(e => {
					return e.beforeEnter = function(to, from, next) {
						if (vm.$root.hashMenus[to.path]) {
							next()
						} else {
							next('/401')
						}
					}
				});
				let originPath = util.deepcopy(userPath);
				originPath[0].children = actualRouter;
				//注入路由
				vm.$router.addRoutes(originPath.concat([{
					path: '*',
					redirect: '/404'
				}]));
			},
			storageMenu: function(allowedRouter) {
				//将子菜单数据复制到meta中，用于实现父级页面功能列表，非必需
				allowedRouter.forEach(route => {
					if (route.children) {
						if (!route.meta) route.meta = {};
						route.meta.children = route.children;
					}
				});
				//保存菜单数据
				this.menuData = allowedRouter;
			},
			signin: function(callback) {
				let vm = this;
				//检查登录状态（检查本地是否已有token）
				let localUser = util.session('token');
				if (!localUser || !localUser.token) {
					// sessionStorage没有读到token，跳转到http://localhost:8088/#/login?from=%2F 登录页
					return vm.$router.push({
						path: '/login',
						query: {
							from: vm.$router.currentRoute.path // vm.$router.currentRoute.path 就是 / 转义字符为 %2F
						}
					});
				}
				//设置请求头统一携带token
				instance.defaults.headers.common['Authorization'] = 'Bearer ' + localUser.token;
				//获取用户信息及权限数据
				instance.get(`/GET/signin`, {
					params: {
						Authorization: localUser.token
					}
				}).then((res) => {
					let userInfo = res.data;
					//取得资源权限对象
					let resourcePermission = vm.getPermission(userInfo);
					//使用资源权限设置请求拦截
					vm.setInterceptor(resourcePermission);
					//获得实际路由
					let allowedRouter = vm.getRoutes(userInfo);
					//若无可用路由限制访问
					if (!allowedRouter || !allowedRouter.length) {
						util.session('token', '');
						return document.body.innerHTML = ('<h1>账号访问受限，请联系系统管理员！</h1>');
					}
					//动态注入路由
					vm.extendRoutes(allowedRouter);
					//保存菜单数据
					vm.storageMenu(allowedRouter);
					//保存用户信息
					vm.userData = userInfo;
					//权限检验方法
					Vue.prototype.$_has = function(rArray) {
						let resources = [];
						let permission = true;
						//提取权限数组
						if (Array.isArray(rArray)) {
							rArray.forEach(function(e) {
								resources = resources.concat(e.p);
							});
						} else {
							resources = resources.concat(rArray.p);
						}
						//校验权限
						resources.forEach(function(p) {
							if (!resourcePermission[p]) {
								return permission = false;
							}
						});
						return permission;
					}
					//执行回调
					typeof callback === 'function' && callback();
				})
			},
			loginDirect: function(newPath) {
				this.signin(() => {
					this.$router.replace({
						path: newPath || '/'
					});
				});
			},
			logoutDirect: function() {
				//退出时清除路由权限控制
				instance.interceptors.request.eject(myInterceptor);
				this.$router.replace({
					path: '/login'
				});
			}
		},
		created: function(newPath) {
			this.signin();
		}
	}
</script>

<style>
	@import './assets/common.css';
</style>