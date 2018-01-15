import Abstract from '../views/common/abstract.vue';

export default [{
    path: '/',
    name: '首页',
    component: (resolve) => require(['../views/index.vue'], resolve),
	children: [
				// 对象一
				{
					path: '/roles',
					name: '平台-角色管理',
					meta: {
						name: '角色管理'
					},
					component: (resolve) => require(['../views/roles.vue'], resolve)
				}, 
				// 对象二
				{
					path: '/accounts',
					name: '平台-账号管理',
					meta: {
						name: '账号管理'
					},
					component: (resolve) => require(['../views/accounts.vue'], resolve)
				}, 
				// 对象三
				{
					path: '/goods',
					name: '商品管理',
					meta: {
						icon: '&#xe62e;'
					},
					component: Abstract,
					children: [
						{
							path: 'list',
							name: '商品信息',
							meta: {

							},
							component: (resolve) => require(['../views/goods-list.vue'], resolve)
						}
					]
				}
	]
}];